// Village Indeed Scraper - Content Script
// Runs on all https://employers.indeed.com/* pages

(function () {
  "use strict";

  const url = window.location.href;

  // Detect login page
  if (
    url.includes("/login") ||
    url.includes("/auth") ||
    document.querySelector('input[type="email"][name="__email"]') ||
    document.querySelector('form[action*="login"]')
  ) {
    chrome.runtime.sendMessage({ type: "login_required" });
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
      chrome.runtime.sendMessage({
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

      // Find the row container (table row or nearest repeating parent)
      const row =
        link.closest("tr") ||
        link.closest('[role="row"]') ||
        link.closest("li") ||
        link.closest("[class]")?.parentElement;

      // Skip already-reviewed candidates: detect green checkmark (shortlisted)
      if (row) {
        let isShortlisted = false;

        // Debug: log the first row's button HTML so we can see actual markup
        if (candidates.length === 0) {
          const debugBtns = row.querySelectorAll("button");
          console.log("[Village] DEBUG - First row buttons (" + debugBtns.length + "):");
          debugBtns.forEach((btn, i) => {
            console.log("[Village] Button " + i + ":", {
              outerHTML: btn.outerHTML.slice(0, 500),
              ariaPressed: btn.getAttribute("aria-pressed"),
              ariaLabel: btn.getAttribute("aria-label"),
              ariaSelected: btn.getAttribute("aria-selected"),
              dataTestId: btn.getAttribute("data-testid"),
              classes: btn.className,
            });
          });
        }

        // Method 1: aria-pressed="true" on any button
        const pressedBtns = row.querySelectorAll('button[aria-pressed="true"]');
        if (pressedBtns.length > 0) {
          isShortlisted = true;
        }

        // Method 2: Look for green SVGs (filled checkmark)
        if (!isShortlisted) {
          const svgs = row.querySelectorAll("button svg");
          for (const svg of svgs) {
            const fills = svg.querySelectorAll("[fill]");
            for (const el of fills) {
              const fill = (el.getAttribute("fill") || "").toLowerCase();
              if (
                fill.includes("#22c55e") || fill.includes("#4caf50") ||
                fill.includes("#16a34a") || fill.includes("#15803d") ||
                fill.includes("green") || fill.includes("#2e7d32") ||
                fill.includes("#43a047") || fill.includes("#66bb6a")
              ) {
                isShortlisted = true;
                break;
              }
            }
            if (isShortlisted) break;
            // Also check inline style for green colors
            const svgHTML = svg.outerHTML.toLowerCase();
            if (/fill:\s*#(22c55e|4caf50|16a34a|15803d|2e7d32|43a047|66bb6a)/.test(svgHTML) ||
                /fill:\s*green/.test(svgHTML)) {
              isShortlisted = true;
              break;
            }
          }
        }

        // Method 3: Check for active/selected classes or data attributes
        if (!isShortlisted) {
          const activeBtns = row.querySelectorAll(
            'button[aria-selected="true"], button[data-active="true"], button[data-selected="true"], ' +
            'button[class*="selected"], button[class*="active"], button[class*="filled"], button[class*="Active"]'
          );
          if (activeBtns.length > 0) {
            isShortlisted = true;
          }
        }

        // Method 4: Check computed styles for green background/color on buttons
        if (!isShortlisted) {
          const btns = row.querySelectorAll("button");
          for (const btn of btns) {
            const style = window.getComputedStyle(btn);
            const bgColor = style.backgroundColor;
            const color = style.color;
            // Check for greenish RGB values
            const greenRgbMatch = (bgColor + " " + color).match(
              /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/g
            );
            if (greenRgbMatch) {
              for (const match of greenRgbMatch) {
                const [, r, g, b] = match.match(/(\d+)/g).map(Number);
                if (g > 120 && g > r * 1.5 && g > b * 1.5) {
                  isShortlisted = true;
                  break;
                }
              }
            }
            if (isShortlisted) break;
          }
        }

        if (isShortlisted) {
          console.log("[Village] Skipping shortlisted candidate:", link.textContent?.trim());
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
    chrome.runtime.sendMessage({
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

    // Strategy 1: Use data-testid selectors (Indeed's current DOM structure)
    const screenerContainer = document.querySelector(
      '[data-testid="Screener questions"], [data-testid="ScreenerAnswersRemoteModule"]'
    );
    if (screenerContainer) {
      // Expand accordion if collapsed
      const toggleBtn = screenerContainer.querySelector(
        'button[aria-expanded="false"]'
      );
      if (toggleBtn) {
        toggleBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      }

      // Find the answers module (may be the container itself or nested)
      const answersModule =
        screenerContainer.querySelector(
          '[data-testid="ScreenerAnswersRemoteModule"]'
        ) || screenerContainer;

      // Each Q&A pair lives in a div[id^="answer-and-question-"]
      const qaPairs = answersModule.querySelectorAll(
        'div[id^="answer-and-question-"]'
      );
      for (const pair of qaPairs) {
        const questionEl = pair.querySelector("h4");
        const answerEl = questionEl
          ? questionEl.nextElementSibling
          : null;
        if (questionEl && answerEl) {
          screenerAnswers.push({
            question: questionEl.textContent?.trim() || "",
            answer: answerEl.textContent?.trim() || "",
          });
        }
      }
    }

    // Strategy 2: Fallback — find screener heading and look for dt/dd pairs
    if (screenerAnswers.length === 0) {
      const headingsForScreener = document.querySelectorAll(
        "h2, h3, h4, [role='heading']"
      );
      let screenerSection = null;
      for (const h of headingsForScreener) {
        if (h.textContent?.toLowerCase().includes("screener question")) {
          screenerSection = h;
          break;
        }
      }
      if (screenerSection) {
        const container =
          screenerSection.closest("section") ||
          screenerSection.parentElement;
        if (container) {
          const dts = container.querySelectorAll("dt, .question");
          const dds = container.querySelectorAll("dd, .answer");
          for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
            screenerAnswers.push({
              question: dts[i].textContent?.trim() || "",
              answer: dds[i].textContent?.trim() || "",
            });
          }
        }
      }
    }

    // Strategy 3: Text-based fallback — split on "?" within screener section
    if (screenerAnswers.length === 0 && screenerContainer) {
      const fullText = screenerContainer.textContent || "";
      const parts = fullText.split("?");
      for (let i = 0; i < parts.length - 1; i++) {
        const question = parts[i].trim().split("\n").pop()?.trim() + "?";
        const answer = parts[i + 1].trim().split("\n")[0]?.trim();
        if (question && answer && answer.length < 200) {
          screenerAnswers.push({ question, answer });
        }
      }
    }

    console.log(
      "[Village] Screener answers found:",
      screenerAnswers.length,
      screenerAnswers
    );

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
        chrome.runtime.sendMessage({ type: "watch_downloads", tabId: true });
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

    chrome.runtime.sendMessage({
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
