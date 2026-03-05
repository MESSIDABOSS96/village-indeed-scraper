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
    // Find "Screener questions" heading
    const headings = document.querySelectorAll(
      "h2, h3, h4, [role='heading']"
    );
    let screenerSection = null;
    for (const h of headings) {
      if (
        h.textContent?.toLowerCase().includes("screener question")
      ) {
        screenerSection = h;
        break;
      }
    }
    if (screenerSection) {
      // Walk siblings/parent to find Q&A pairs
      let container =
        screenerSection.closest("section") ||
        screenerSection.parentElement;
      if (container) {
        // Look for question-answer patterns
        // Questions are typically bold/strong, answers follow
        const allElements = container.querySelectorAll("*");
        let currentQuestion = "";
        for (const el of allElements) {
          const text = el.textContent?.trim();
          if (!text) continue;
          // Bold or strong elements are likely questions
          if (
            (el.tagName === "STRONG" ||
              el.tagName === "B" ||
              window.getComputedStyle(el).fontWeight >= 600) &&
            text.length > 10 &&
            text.includes("?")
          ) {
            currentQuestion = text;
          } else if (currentQuestion && el !== screenerSection) {
            // Check if this looks like an answer (has left border or follows question)
            const style = window.getComputedStyle(el);
            if (
              style.borderLeftWidth &&
              parseInt(style.borderLeftWidth) > 0
            ) {
              screenerAnswers.push({
                question: currentQuestion,
                answer: text,
              });
              currentQuestion = "";
            }
          }
        }
        // Fallback: look for dt/dd or label/value pairs
        if (screenerAnswers.length === 0) {
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

    // Extract resume text
    let resumeText = "";
    // Find "Resume" heading
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

    console.log("[Village] Extracted profile:", {
      name,
      location,
      jobTitle,
      screenerCount: screenerAnswers.length,
      resumeLength: resumeText.length,
    });

    chrome.runtime.sendMessage({
      type: "candidate_profile",
      name,
      location,
      jobTitle,
      screenerAnswers,
      resumeText,
    });
  }
})();
