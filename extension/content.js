// Village Indeed Scraper - Content Script
// Runs on all https://employers.indeed.com/* pages

(function () {
  "use strict";

  // Safe wrapper — chrome.runtime can become undefined after extension reload
  function safeSendMessage(msg) {
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(msg);
    } else {
      console.warn("[Village] Extension context invalidated, cannot send message");
    }
  }

  const url = window.location.href;

  // Detect login page
  if (
    url.includes("/login") ||
    url.includes("/auth") ||
    document.querySelector('input[type="email"][name="__email"]') ||
    document.querySelector('form[action*="login"]')
  ) {
    safeSendMessage({ type: "login_required" });
    return;
  }

  // Wait for page content to render (Indeed is a React SPA)
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  function waitForElements(selector, timeout = 15000) {
    return new Promise((resolve) => {
      const existing = document.querySelectorAll(selector);
      if (existing.length > 0) {
        resolve(existing);
        return;
      }

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelectorAll(selector));
      }, timeout);

      const observer = new MutationObserver(() => {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(els);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Determine page type and extract accordingly
  if (isCandidateProfilePage()) {
    extractCandidateProfile();
  } else if (isCandidateListPage()) {
    detectAddCandidatePageOrExtractList();
  }

  function isCandidateListPage() {
    // URL like /candidates?statusName=All (no /view)
    return /\/candidates(\?|$)/.test(url) && !url.includes("/candidates/view");
  }

  function isCandidateProfilePage() {
    // URL like /candidates/view?id=...
    return url.includes("/candidates/view");
  }

  async function detectAddCandidatePageOrExtractList() {
    // Wait a moment for the page to render
    await new Promise((r) => setTimeout(r, 3000));

    // Check if this is the "Add candidate" form instead of the list
    const addCandidateHeading = Array.from(
      document.querySelectorAll("h1, h2, h3")
    ).find((el) => el.textContent?.trim().toLowerCase().includes("add candidate"));
    const addCandidateForm = document.querySelector(
      'form[action*="candidate"], input[name="candidateName"], input[name="email"]'
    );

    if (addCandidateHeading || addCandidateForm) {
      console.log("[Village] Detected 'Add candidate' page instead of candidate list");
      safeSendMessage({
        type: "error",
        message: "Landed on 'Add candidate' page instead of candidate list. URL may be incorrect.",
      });
      return;
    }

    extractCandidateList();
  }

  // --- Candidate List Extraction ---
  async function extractCandidateList() {
    // Wait for candidate profile links to appear in the table
    await waitForElement("a[href*='/candidates/view']", 15000);

    // Give more time for the full table to render
    await new Promise((r) => setTimeout(r, 2000));

    const candidates = [];
    const seen = new Set();

    // Find all links pointing to candidate profile pages
    const candidateLinks = document.querySelectorAll(
      "a[href*='/candidates/view']"
    );

    for (const link of candidateLinks) {
      const profileUrl = link.href;
      if (seen.has(profileUrl)) continue;
      seen.add(profileUrl);

      // Find the row container — walk up from the link until we find a
      // container that also contains buttons (the review checkmark lives there)
      let row =
        link.closest("tr") ||
        link.closest('[role="row"]') ||
        link.closest("li");

      if (!row) {
        // Walk up until we find an ancestor that contains buttons
        let ancestor = link.parentElement;
        while (ancestor && ancestor !== document.body) {
          const btns = ancestor.querySelectorAll("button");
          if (btns.length > 0) {
            row = ancestor;
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }

      // Skip already-reviewed candidates: detect green checkmark (shortlisted)
      if (row) {
        let isShortlisted = false;

        // Debug: log the first candidate's row so we can see actual markup
        if (candidates.length === 0 && seen.size === 1) {
          const debugBtns = row.querySelectorAll("button");
          console.log("[Village] DEBUG - Row element:", row.tagName, row.className?.slice(0, 200));
          console.log("[Village] DEBUG - Row innerHTML (first 2000):", row.innerHTML?.slice(0, 2000));
          console.log("[Village] DEBUG - First row buttons (" + debugBtns.length + "):");
          debugBtns.forEach((btn, i) => {
            console.log("[Village] Button " + i + ":", {
              outerHTML: btn.outerHTML.slice(0, 800),
              ariaPressed: btn.getAttribute("aria-pressed"),
              ariaLabel: btn.getAttribute("aria-label"),
              ariaSelected: btn.getAttribute("aria-selected"),
              dataTestId: btn.getAttribute("data-testid"),
              classes: btn.className,
            });
            // Log computed colors on button and its SVGs
            const style = window.getComputedStyle(btn);
            console.log("[Village] Button " + i + " computed:", {
              bg: style.backgroundColor,
              color: style.color,
              fill: style.fill,
            });
            const svgs = btn.querySelectorAll("svg, svg *");
            svgs.forEach((s, j) => {
              const sStyle = window.getComputedStyle(s);
              console.log("[Village] Button " + i + " svg " + j + ":", {
                fill: s.getAttribute("fill"),
                computedFill: sStyle.fill,
                computedColor: sStyle.color,
                tag: s.tagName,
              });
            });
          });
        }

        // Method 1: aria-pressed="true" on any button
        const pressedBtns = row.querySelectorAll('button[aria-pressed="true"]');
        if (pressedBtns.length > 0) {
          isShortlisted = true;
          console.log("[Village] Detected reviewed (aria-pressed):", link.textContent?.trim());
        }

        // Method 2: Look for green SVGs (filled checkmark) — check all fill attributes and styles
        if (!isShortlisted) {
          const svgs = row.querySelectorAll("button svg, button svg *");
          for (const el of svgs) {
            const fill = (el.getAttribute("fill") || "").toLowerCase();
            const style = (el.getAttribute("style") || "").toLowerCase();
            const computedFill = window.getComputedStyle(el).fill?.toLowerCase() || "";
            const allFills = fill + " " + style + " " + computedFill;
            // Match any greenish color
            if (
              /green|#22c55e|#4caf50|#16a34a|#15803d|#2e7d32|#43a047|#66bb6a|#10b981|#059669|#34d399|#6ee7b7/.test(allFills) ||
              /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/.test(allFills)
            ) {
              // For rgb(), check if it's actually green
              const rgbMatch = allFills.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
              if (rgbMatch) {
                const [, r, g, b] = rgbMatch.map(Number);
                if (g > 100 && g > r * 1.3 && g > b * 1.3) {
                  isShortlisted = true;
                  console.log("[Village] Detected reviewed (green SVG rgb):", link.textContent?.trim(), `rgb(${r},${g},${b})`);
                  break;
                }
              } else {
                isShortlisted = true;
                console.log("[Village] Detected reviewed (green SVG fill):", link.textContent?.trim(), fill || computedFill);
                break;
              }
            }
          }
        }

        // Method 3: Check for active/selected classes or data attributes
        if (!isShortlisted) {
          const activeBtns = row.querySelectorAll(
            'button[aria-selected="true"], button[data-active="true"], button[data-selected="true"], ' +
            'button[class*="selected"], button[class*="active"], button[class*="filled"], button[class*="Active"], ' +
            'button[class*="Selected"], button[class*="Filled"], button[class*="checked"], button[class*="Checked"]'
          );
          if (activeBtns.length > 0) {
            isShortlisted = true;
            console.log("[Village] Detected reviewed (active class/attr):", link.textContent?.trim());
          }
        }

        // Method 4: Check computed styles for green background/color on buttons and their children
        if (!isShortlisted) {
          const btns = row.querySelectorAll("button");
          for (const btn of btns) {
            // Check button itself and all descendants for green colors
            const els = [btn, ...btn.querySelectorAll("*")];
            for (const el of els) {
              const style = window.getComputedStyle(el);
              const colors = [style.backgroundColor, style.color, style.fill].join(" ");
              const rgbMatches = colors.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/g) || [];
              for (const match of rgbMatches) {
                const [, r, g, b] = match.match(/(\d+)/g).map(Number);
                if (g > 100 && g > r * 1.3 && g > b * 1.3) {
                  isShortlisted = true;
                  console.log("[Village] Detected reviewed (computed green):", link.textContent?.trim(), match);
                  break;
                }
              }
              if (isShortlisted) break;
            }
            if (isShortlisted) break;
          }
        }

        if (isShortlisted) {
          console.log("[Village] Skipping reviewed candidate:", link.textContent?.trim());
          continue;
        }
      }

      // Extract candidate name from the link text
      const name = link.textContent?.trim() || "";

      // Extract location: look for "City, ST" pattern near the name
      let location = "";
      if (row) {
        const rowText = row.textContent || "";
        const locMatch = rowText.match(
          /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/
        );
        if (locMatch) location = locMatch[1];
      }

      // Extract job title from "Applied to:" link
      let jobTitle = "";
      if (row) {
        // Look for a link that is NOT the candidate profile link (likely the job link)
        const allLinks = row.querySelectorAll("a");
        for (const a of allLinks) {
          if (
            a.href.includes("/candidates/view") ||
            a === link
          )
            continue;
          // Job links typically go to /jobs/ or /job/ or contain the job title text
          const text = a.textContent?.trim();
          if (text && text.length > 2) {
            jobTitle = text;
            break;
          }
        }
      }

      candidates.push({ profileUrl, name, location, jobTitle });
    }

    console.log(
      "[Village] Extracted candidate list:",
      candidates.length,
      "candidates"
    );
    safeSendMessage({
      type: "candidate_list",
      candidates,
    });
  }

  // --- Candidate Profile Extraction ---
  async function extractCandidateProfile() {
    // Wait for profile content to render
    await waitForElement(
      '[data-testid="namePlate"], [data-testid="candidate-review-page"], h3',
      15000
    );
    // Extra wait for dynamic sections
    await new Promise((r) => setTimeout(r, 2000));

    // Extract name
    let name = "";
    const namePlate = document.querySelector('[data-testid="namePlate"]');
    if (namePlate) {
      const h3 = namePlate.querySelector("h3");
      name = h3?.textContent?.trim() || namePlate.textContent?.trim() || "";
    } else {
      // Fallback: first h3 on page
      const h3 = document.querySelector("h3");
      name = h3?.textContent?.trim() || "";
    }

    // Extract location - look for pin/location icon followed by text
    let location = "";
    // Try data-testid approach
    const locationEl = document.querySelector(
      '[data-testid*="location"], [data-testid*="Location"]'
    );
    if (locationEl) {
      location = locationEl.textContent?.trim() || "";
    } else if (namePlate) {
      // Look in namePlate area for "City, ST" pattern
      const namePlateText = namePlate.parentElement?.textContent || "";
      const locMatch = namePlateText.match(
        /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/
      );
      if (locMatch) location = locMatch[1];
    }
    if (!location) {
      // Broader search for location pattern in upper portion of page
      const allText = document.body.textContent || "";
      const locMatch = allText.match(
        /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})\s*\d{5}/
      );
      if (locMatch) location = locMatch[1];
    }

    // Extract job title
    let jobTitle = "";
    const jobHeader = document.querySelector(
      '[data-testid="jobLevelHeader"] h2'
    );
    if (jobHeader) {
      jobTitle = jobHeader.textContent?.trim() || "";
    } else {
      const h2 = document.querySelector("h2");
      if (h2) jobTitle = h2.textContent?.trim() || "";
    }

    // Extract screener questions and answers
    const screenerAnswers = [];

    // --- Find screener heading ---
    let screenerHeading = null;
    const allHeadings = document.querySelectorAll(
      "h2, h3, h4, h5, [role='heading'], button, [aria-expanded]"
    );
    for (const h of allHeadings) {
      if (h.textContent?.toLowerCase().includes("screener question")) {
        screenerHeading = h;
        break;
      }
    }

    // --- Find screener container ---
    let screenerContainer = null;

    // Try data-testid first
    screenerContainer = document.querySelector(
      '[data-testid="Screener questions"], [data-testid="ScreenerAnswersRemoteModule"]'
    );

    // Try any data-testid containing "screener"
    if (!screenerContainer) {
      const allTestIdEls = document.querySelectorAll("[data-testid]");
      for (const el of allTestIdEls) {
        if (el.getAttribute("data-testid")?.toLowerCase().includes("screener")) {
          screenerContainer = el;
          break;
        }
      }
    }

    // Walk up from heading to find a container that encompasses Q&A content
    if (!screenerContainer && screenerHeading) {
      screenerContainer =
        screenerHeading.closest("section") ||
        screenerHeading.closest('[class*="card"]') ||
        screenerHeading.closest('[class*="panel"]');

      // If no semantic container, walk up ancestors until we find one
      // that contains bold/strong descendants (the actual questions)
      if (!screenerContainer) {
        let ancestor = screenerHeading.parentElement;
        while (ancestor && ancestor !== document.body) {
          const bolds = ancestor.querySelectorAll("strong, b");
          // Must contain bold elements beyond just the heading itself
          const hasBoldQuestions = Array.from(bolds).some(
            (b) => !b.textContent?.toLowerCase().includes("screener question")
          );
          if (hasBoldQuestions) {
            screenerContainer = ancestor;
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }
    }

    // --- "Between headings" strategy: collect nodes between Screener and Resume headings ---
    let betweenNodes = [];
    if (screenerHeading) {
      // Find the Resume heading that follows
      const pageHeadings = document.querySelectorAll(
        "h2, h3, h4, h5, [role='heading']"
      );
      let foundScreener = false;
      let resumeHeading = null;
      for (const h of pageHeadings) {
        if (h === screenerHeading || h.contains(screenerHeading) || screenerHeading.contains(h)) {
          foundScreener = true;
          continue;
        }
        if (foundScreener && h.textContent?.trim().toLowerCase().startsWith("resume")) {
          resumeHeading = h;
          break;
        }
      }

      // Walk DOM siblings/ancestors to collect elements between the two headings
      if (foundScreener) {
        // Find common ancestor
        const commonParent = screenerHeading.parentElement?.parentElement?.parentElement || document.body;
        const allEls = commonParent.querySelectorAll("*");
        let inRange = false;
        for (const el of allEls) {
          if (el === screenerHeading || el.contains(screenerHeading) || screenerHeading.contains(el)) {
            inRange = true;
            continue;
          }
          if (resumeHeading && (el === resumeHeading || el.contains(resumeHeading) || resumeHeading.contains(el))) {
            break;
          }
          if (inRange) {
            betweenNodes.push(el);
          }
        }
      }
    }

    console.log("[Village] Screener debug:", {
      headingFound: !!screenerHeading,
      containerFound: !!screenerContainer,
      betweenNodesCount: betweenNodes.length,
      containerHTML: screenerContainer?.innerHTML?.substring(0, 500),
    });

    // Expand accordion if collapsed (try both container and heading contexts)
    const expandTargets = [screenerContainer, screenerHeading?.parentElement, screenerHeading?.parentElement?.parentElement].filter(Boolean);
    for (const target of expandTargets) {
      const toggleBtn = target.querySelector?.(
        'button[aria-expanded="false"]'
      );
      if (toggleBtn) {
        toggleBtn.click();
        await new Promise((r) => setTimeout(r, 500));
        break;
      }
    }

    // Determine the search scope: prefer container, fallback to betweenNodes wrapper
    const searchScope = screenerContainer || (betweenNodes.length > 0 ? (() => {
      // Create a virtual scope by using the common parent
      const wrapper = document.createElement("div");
      betweenNodes.forEach((n) => {
        if (n.parentElement) wrapper.appendChild(n.cloneNode(true));
      });
      return wrapper;
    })() : null);

    if (searchScope) {
      // Strategy 1: div[id^="answer-and-question-"] pairs (matches current Indeed DOM)
      const qaPairs = searchScope.querySelectorAll(
        'div[id^="answer-and-question-"]'
      );
      for (const pair of qaPairs) {
        const questionEl = pair.querySelector("h4, strong, b");
        if (questionEl) {
          const answerText = questionEl.nextElementSibling?.textContent?.trim() || "";
          const qText = questionEl.textContent?.trim() || "";
          if (qText && answerText) {
            screenerAnswers.push({ question: qText, answer: answerText });
          }
        }
      }

      // Strategy 2: Bold/strong text (questions) with multi-level sibling traversal for answers
      const boldEls = searchScope.querySelectorAll(
        "strong, b, h4, h3, [style*='font-weight']"
      );
      const boldArray = Array.from(boldEls).filter(
        (b) => {
          const t = b.textContent?.trim().toLowerCase() || "";
          return t && !t.includes("screener question") && t.length > 10;
        }
      );

      if (screenerAnswers.length === 0) {
        for (const boldEl of boldArray) {
          const qText = boldEl.textContent?.trim();

          // Walk up multiple levels to find a sibling (answer block)
          let answerText = "";
          let sibling = null;
          let ancestor = boldEl;
          while (!sibling && ancestor && ancestor !== searchScope) {
            sibling = ancestor.nextElementSibling;
            if (!sibling) {
              ancestor = ancestor.parentElement;
            }
          }

          if (sibling) {
            // Check for blockquote or inline-styled border-left (answer indicator)
            const blockquote = sibling.matches?.("blockquote")
              ? sibling
              : sibling.querySelector?.("blockquote");
            if (blockquote) {
              answerText = blockquote.textContent?.trim() || "";
            } else {
              // Check inline style for border-left (more reliable than getComputedStyle in background tabs)
              const hasBorderStyle = (el) =>
                el?.getAttribute?.("style")?.includes("border-left") ||
                el?.getAttribute?.("class")?.includes("border");
              const borderedEl = hasBorderStyle(sibling)
                ? sibling
                : sibling.querySelector?.("[style*='border-left'], [class*='border']");
              if (borderedEl) {
                answerText = borderedEl.textContent?.trim() || "";
              } else {
                answerText = sibling.textContent?.trim() || "";
              }
            }
          }

          if (qText && answerText && answerText !== qText) {
            screenerAnswers.push({ question: qText, answer: answerText });
          }
        }
      }

      // Strategy 3: Use bold elements as anchors, grab text between consecutive bolds
      if (screenerAnswers.length === 0 && boldArray.length > 0) {
        const fullText = searchScope.textContent || "";
        for (let i = 0; i < boldArray.length; i++) {
          const qText = boldArray[i].textContent?.trim();
          if (!qText) continue;

          const qIdx = fullText.indexOf(qText);
          if (qIdx === -1) continue;

          const afterQ = qIdx + qText.length;
          // Answer ends at the next bold text or end of content
          let endIdx = fullText.length;
          if (i + 1 < boldArray.length) {
            const nextQ = boldArray[i + 1].textContent?.trim();
            if (nextQ) {
              const nextIdx = fullText.indexOf(nextQ, afterQ);
              if (nextIdx !== -1) endIdx = nextIdx;
            }
          }

          const answerText = fullText.substring(afterQ, endIdx).trim();
          if (qText && answerText && answerText.length < 500) {
            screenerAnswers.push({ question: qText, answer: answerText });
          }
        }
      }

      // Strategy 4: Plain text splitting (handles "?" and "." terminated questions)
      if (screenerAnswers.length === 0) {
        const fullText = (searchScope.textContent || "")
          .replace(/screener questions?/gi, "")
          .trim();
        // Split on "?" as before
        const parts = fullText.split("?");
        for (let i = 0; i < parts.length - 1; i++) {
          const question = parts[i].trim().split("\n").pop()?.trim() + "?";
          const answer = parts[i + 1].trim().split("\n")[0]?.trim();
          if (question && answer && answer.length < 200 && question.length > 5) {
            screenerAnswers.push({ question, answer });
          }
        }
      }
    }

    console.log("[Village] Screener results:", JSON.stringify(screenerAnswers));

    // Extract resume text
    let resumeText = "";
    // Find "Resume" heading
    const headings = document.querySelectorAll(
      "h2, h3, h4, [role='heading']"
    );
    let resumeSection = null;
    for (const h of headings) {
      if (
        h.textContent?.trim().toLowerCase() === "resume" ||
        h.textContent?.trim().toLowerCase() === "resume:"
      ) {
        resumeSection = h;
        break;
      }
    }
    if (resumeSection) {
      // Get the container after the resume heading
      let container =
        resumeSection.closest("section") ||
        resumeSection.parentElement;
      if (container) {
        // Get all text content from the resume section
        resumeText = container.textContent?.trim() || "";
        // Remove the "Resume" heading itself and any "Download resume" text
        resumeText = resumeText
          .replace(/^Resume:?\s*/i, "")
          .replace(/Download resume/gi, "")
          .trim();
      }
    }

    // If no resume section found, try broader approaches
    if (!resumeText) {
      // Look for a resume container by common patterns
      const resumeContainer = document.querySelector(
        '[data-testid*="resume"], [class*="resume-content"], [class*="resumeContent"]'
      );
      if (resumeContainer) {
        resumeText = resumeContainer.textContent?.trim() || "";
      }
    }

    // Extract resume download URL
    let resumeDownloadUrl = "";

    // Helper: search a document root for download links
    function findDownloadLink(root) {
      if (!root) return "";

      // Strategy Indeed: exact data-testid for Indeed's download button
      const indeedLink = root.querySelector('a[data-testid="download-resume-inline"]');
      if (indeedLink) {
        const href = indeedLink.getAttribute("href") || "";
        if (href) {
          console.log("[Village] Found Indeed download-resume-inline link:", href.slice(0, 200));
          return href;
        }
      }

      // Strategy 0 (highest priority): Find PDF viewer embed/object/iframe src
      const pdfViewers = root.querySelectorAll(
        'embed[src], object[data], iframe[src]'
      );
      for (const viewer of pdfViewers) {
        const src = viewer.getAttribute("src") || viewer.getAttribute("data") || "";
        if (src && (src.includes(".pdf") || src.includes("resume") || src.includes("document"))) {
          console.log("[Village] Found PDF viewer src (by keyword):", src.slice(0, 200));
          return src;
        }
      }
      // Also check for any embed/object (PDF viewers often don't have "pdf" in URL)
      for (const viewer of pdfViewers) {
        const src = viewer.getAttribute("src") || viewer.getAttribute("data") || "";
        const type = (viewer.getAttribute("type") || "").toLowerCase();
        if (src && (type.includes("pdf") || type === "")) {
          console.log("[Village] Found PDF viewer src (by type/fallback):", src.slice(0, 200));
          return src;
        }
      }

      // Strategy 1: aria-label containing "download"
      const ariaEl = root.querySelector(
        'a[aria-label*="ownload"], button[aria-label*="ownload"], [role="link"][aria-label*="ownload"]'
      );
      if (ariaEl) {
        const href = ariaEl.getAttribute("href") || ariaEl.getAttribute("data-href") || "";
        if (href) return href;
      }
      // Strategy 2: data-testid containing "download"
      const testIdEl = root.querySelector(
        'a[data-testid*="download"], button[data-testid*="download"]'
      );
      if (testIdEl) {
        const href = testIdEl.getAttribute("href") || testIdEl.getAttribute("data-href") || "";
        if (href) return href;
      }
      // Strategy 3: text content matching "download resume" / "download cv"
      const allClickable = root.querySelectorAll("a[href], button[data-href], a[download]");
      for (const el of allClickable) {
        const text = (el.textContent || "").toLowerCase();
        const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
        if ((text.includes("download resume") || text.includes("download cv")) && href) {
          return href;
        }
      }
      // Strategy 4: direct PDF links
      const pdfLinks = root.querySelectorAll('a[href*=".pdf"], a[href*="resume"], a[download]');
      for (const a of pdfLinks) {
        const href = a.getAttribute("href") || "";
        if (href && (href.includes("resume") || href.endsWith(".pdf") || a.hasAttribute("download"))) {
          return href;
        }
      }
      return "";
    }

    // Fallback: find and click a "Download resume" button, intercept the resulting URL
    function tryClickDownload() {
      return new Promise((resolve) => {
        // Find any element with "download resume" text
        const allElements = document.querySelectorAll("a, button, [role='button']");
        let downloadBtn = null;
        for (const el of allElements) {
          const text = (el.textContent || "").toLowerCase().trim();
          if (text.includes("download resume") || text.includes("download cv")) {
            downloadBtn = el;
            console.log("[Village] Found download button (no href):", el.outerHTML.slice(0, 500));
            break;
          }
        }

        if (!downloadBtn) {
          console.log("[Village] No download button found to click");
          resolve("");
          return;
        }

        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            console.log("[Village] Click fallback timed out");
            resolve("");
          }
        }, 8000);

        // Watch for dynamically-created <a> elements with download attributes or href
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;
              // Check the node itself and its children
              const anchors = node.tagName === "A" ? [node] : node.querySelectorAll ? [...node.querySelectorAll("a")] : [];
              for (const a of anchors) {
                const href = a.getAttribute("href") || "";
                if (href && (href.includes(".pdf") || href.includes("resume") || href.includes("document") || a.hasAttribute("download"))) {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    observer.disconnect();
                    console.log("[Village] Intercepted dynamic download link:", href.slice(0, 200));
                    resolve(href);
                  }
                  return;
                }
              }
              // Check for embed/object/iframe that appeared
              const viewers = node.tagName && ["EMBED", "OBJECT", "IFRAME"].includes(node.tagName) ? [node] : node.querySelectorAll ? [...node.querySelectorAll("embed, object, iframe")] : [];
              for (const viewer of viewers) {
                const src = viewer.getAttribute("src") || viewer.getAttribute("data") || "";
                if (src) {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    observer.disconnect();
                    console.log("[Village] Intercepted dynamic viewer src:", src.slice(0, 200));
                    resolve(src);
                  }
                  return;
                }
              }
            }
          }
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "src", "data"] });

        // Intercept URL.createObjectURL
        const origCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = function (obj) {
          const url = origCreateObjectURL.call(URL, obj);
          console.log("[Village] Intercepted createObjectURL:", url);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            observer.disconnect();
            URL.createObjectURL = origCreateObjectURL;
            resolve(url);
          }
          return url;
        };

        // Click the button
        console.log("[Village] Clicking download button...");
        downloadBtn.click();

        // Also try sending the click result back to background for download interception
        safeSendMessage({ type: "watch_downloads", tabId: true });
      });
    }

    function resolveUrl(href) {
      if (!href) return "";
      try {
        return new URL(href, window.location.origin).href;
      } catch (_) {
        return href;
      }
    }

    // Debug: dump resume section DOM so we can see what's actually there
    if (resumeSection) {
      const container = resumeSection.closest("section") || resumeSection.parentElement;
      console.log("[Village] Resume section HTML:", container?.innerHTML?.slice(0, 2000));
    }

    // Debug: dump all embeds, objects, iframes, and download-like buttons on the page
    const debugEmbeds = document.querySelectorAll("embed, object, iframe");
    console.log("[Village] DEBUG - Found", debugEmbeds.length, "embed/object/iframe elements on page:");
    debugEmbeds.forEach((el, i) => {
      console.log("[Village]  ", i, el.tagName, {
        src: el.getAttribute("src")?.slice(0, 200),
        data: el.getAttribute("data")?.slice(0, 200),
        type: el.getAttribute("type"),
      });
    });
    const debugDownloadBtns = document.querySelectorAll("a, button, [role='button']");
    for (const el of debugDownloadBtns) {
      const text = (el.textContent || "").toLowerCase().trim();
      if (text.includes("download") || text.includes("resume")) {
        console.log("[Village] DEBUG - Download/resume element:", {
          tag: el.tagName,
          text: text.slice(0, 100),
          href: el.getAttribute("href")?.slice(0, 200),
          outerHTML: el.outerHTML.slice(0, 500),
        });
      }
    }

    // Wait for the resume panel to fully load (Indeed creates blob URL when PDF viewer loads)
    console.log("[Village] Waiting for ResumePanel_loaded...");
    const resumePanel = await waitForElement('[data-testid="ResumePanel_loaded"]', 10000);
    if (resumePanel) {
      console.log("[Village] ResumePanel_loaded found");
    } else {
      console.log("[Village] ResumePanel_loaded not found, continuing with fallback waits");
    }

    // Wait for the resume section / download link to render (loads lazily after nameplate)
    console.log("[Village] Waiting for resume download link to appear...");
    await new Promise((r) => setTimeout(r, 3000));

    // Try expanding the Resume section if it's collapsed
    for (const h of headings) {
      const hText = (h.textContent || "").trim().toLowerCase();
      if (hText === "resume" || hText === "resume:") {
        const clickTarget = h.closest("button") || h.closest("[role='button']") || h;
        if (clickTarget && clickTarget !== h) {
          console.log("[Village] Clicking resume heading to expand section");
          clickTarget.click();
          await new Promise((r) => setTimeout(r, 2000));
        }
        break;
      }
    }

    // Search main document
    resumeDownloadUrl = resolveUrl(findDownloadLink(document));
    console.log("[Village] Download link search (main document):", resumeDownloadUrl || "not found");

    // Search inside iframes if not found
    if (!resumeDownloadUrl) {
      const iframes = document.querySelectorAll("iframe");
      console.log("[Village] Checking", iframes.length, "iframes for download link");
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          const href = findDownloadLink(iframeDoc);
          if (href) {
            resumeDownloadUrl = resolveUrl(href);
            console.log("[Village] Found download link in iframe:", resumeDownloadUrl);
            break;
          }
        } catch (e) {
          console.log("[Village] Cannot access iframe (cross-origin):", e.message);
        }
      }
    }

    // Last resort: wait longer and retry once
    if (!resumeDownloadUrl) {
      console.log("[Village] Download link not found yet, waiting 5 more seconds...");
      await new Promise((r) => setTimeout(r, 5000));
      resumeDownloadUrl = resolveUrl(findDownloadLink(document));
      // Re-check iframes
      if (!resumeDownloadUrl) {
        for (const iframe of document.querySelectorAll("iframe")) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            const href = findDownloadLink(iframeDoc);
            if (href) {
              resumeDownloadUrl = resolveUrl(href);
              break;
            }
          } catch (_) {}
        }
      }
      console.log("[Village] Download link after extended wait:", resumeDownloadUrl || "not found");
    }

    // Fallback: click the "Download resume" button and intercept the download
    if (!resumeDownloadUrl) {
      console.log("[Village] Trying click-to-download fallback...");
      const clickResult = await tryClickDownload();
      if (clickResult) {
        resumeDownloadUrl = clickResult;
        console.log("[Village] Got URL via click fallback:", resumeDownloadUrl.slice(0, 200));
      }
    }

    // If the URL is a blob: URL, fetch it in the content script (blob URLs are page-scoped)
    let resumePdfBase64 = "";
    if (resumeDownloadUrl && resumeDownloadUrl.startsWith("blob:")) {
      try {
        console.log("[Village] Fetching blob URL in content script:", resumeDownloadUrl.slice(0, 200));
        const resp = await fetch(resumeDownloadUrl);
        const blob = await resp.blob();
        resumePdfBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        console.log("[Village] Fetched blob PDF in content script:", resumePdfBase64.length, "chars");
      } catch (e) {
        console.warn("[Village] Failed to fetch blob URL:", e);
      }
    }

    console.log("[Village] Extracted profile:", {
      name,
      location,
      jobTitle,
      screenerCount: screenerAnswers.length,
      resumeLength: resumeText.length,
      resumeDownloadUrl: resumeDownloadUrl ? "found" : "not found",
      resumePdfBase64Length: resumePdfBase64.length,
    });

    safeSendMessage({
      type: "candidate_profile",
      name,
      location,
      jobTitle,
      screenerAnswers,
      resumeText,
      resumeDownloadUrl,
      resumePdfBase64,
    });
  }
})();
