const fs = require('fs');

const rawQuestions = [
  {
    title: "HTTP Methods",
    questionText: "A user fills out a sensitive password change form on a banking website and clicks the submit button. The web browser encapsulates the user data into the body payload of a secure HTTP request rather than appending the credentials into the visible URL query string parameter list. Which HTTP request method does the web application utilize for this secure data submission, and how does it differ from a standard page fetch?",
    options: [
      "`POST` method; it sends data inside the HTTP request body without exposing parameters in the URL, unlike `GET`.",
      "`GET` method; it appends parameters to the URL string for fast caching by proxy servers.",
      "`PUT` method; it creates a static HTML document in the browser cache without contacting the server.",
      "`HEAD` method; it returns only header metadata while stripping form input field values."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Semantic HTML",
    questionText: "A web developer replaces a generic layout structure composed entirely of nested `<div>` containers (`<div class=\"header\">`, `<div class=\"nav\">`, `<div class=\"footer\">`) with semantic HTML5 elements (`<header>`, `<nav>`, `<footer>`). Which statement accurately describes the technical impact of this refactoring on accessibility, search engine optimization (SEO), and document structure?",
    options: [
      "Semantic elements provide explicit structural meaning to screen readers and search engine crawlers, improving accessibility and indexing without altering visual layout.",
      "Semantic elements automatically apply responsive CSS grid styling to the page without requiring external stylesheets.",
      "Non-semantic `<div>` elements execute faster in browser rendering engines because they bypass DOM tree node creation.",
      "Semantic HTML5 elements prevent client-side JavaScript execution from manipulating internal DOM nodes."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Table Spanning",
    questionText: "Consider the following HTML table structure containing cell spanning attributes:\n\n```html\n<table border=\"1\">\n  <tr>\n    <th colspan=\"2\">Quarter 1</th>\n    <th>Quarter 2</th>\n  </tr>\n  <tr>\n    <td rowspan=\"2\">Product A</td>\n    <td>$500</td>\n    <td>$600</td>\n  </tr>\n  <tr>\n    <td>$550</td>\n    <td>$650</td>\n  </tr>\n</table>\n```\n\nHow many total `<th>` and `<td>` table data cells are rendered across the entire table, and how many visible columns does the top header row span?",
    options: [
      "7 total cells rendered; top row spans 3 visible columns.",
      "9 total cells rendered; top row spans 2 visible columns.",
      "6 total cells rendered; top row spans 2 visible columns.",
      "8 total cells rendered; top row spans 4 visible columns."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Status Codes",
    questionText: "A frontend developer inspects the browser Network Developer Console while loading a website. An image tag `<img src=\"hero_banner.png\">` displays a broken image icon because the server cannot locate `hero_banner.png` at the requested URL path. Meanwhile, a form submission script crashes on the backend server due to an unhandled database exception. Which HTTP response status codes correspond to these two respective client and server errors?",
    options: [
      "Broken image: `404 Not Found`; Server crash: `500 Internal Server Error`.",
      "Broken image: `200 OK`; Server crash: `403 Forbidden`.",
      "Broken image: `301 Moved Permanently`; Server crash: `400 Bad Request`.",
      "Broken image: `500 Internal Server Error`; Server crash: `404 Not Found`."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Path Navigation",
    questionText: "A website file structure has a root folder containing `index.html` and a subfolder named `blog/` containing `article.html`. Inside `blog/article.html`, a developer adds a hyperlink intended to navigate back to `index.html` located in the parent directory:\n\n```html\n<a href=\"../index.html\">Return to Home</a>\n```\n\nWhat does the path prefix `../` signify in relative URL navigation, and where will the browser attempt to load the file from?",
    options: [
      "`../` moves up one directory level from `blog/` to the root folder to locate `index.html`.",
      "`../` navigates to the root web domain protocol regardless of current folder depth.",
      "`../` searches inside a sibling directory named `index/` for `article.html`.",
      "`../` reloads the current `article.html` page in an isolated secondary browser tab."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Media Attributes",
    questionText: "Analyze the following HTML5 media code snippet embedding an informational video:\n\n```html\n<video src=\"intro.mp4\" width=\"600\" poster=\"preview.jpg\" controls muted autoplay>\n  Your browser does not support the video tag.\n</video>\n```\n\nWhat is the function of the `poster`, `controls`, and `muted` attributes in this video element?",
    options: [
      "`poster` displays `preview.jpg` before video playback starts; `controls` adds play/pause/volume UI buttons; `muted` silences initial audio output.",
      "`poster` sends the video to a printing service; `controls` disables user playback; `muted` converts video to monochrome.",
      "`poster` creates a background watermark; `controls` auto-loops the clip; `muted` increases audio bass boost.",
      "`poster` validates the video file format; `controls` hides full-screen mode; `muted` blocks video streaming bandwidth."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Element Nesting",
    questionText: "A junior developer writes an HTML page and nests a block-level `<div>` element inside an inline paragraph element: `<p>Welcome to our site <div>Nested Box</div></p>`. How will a modern browser HTML5 parser handle this invalid element nesting during DOM tree construction?",
    options: [
      "The browser parser automatically closes the `<p>` element immediately before opening the block-level `<div>`, creating two sibling elements instead of a nested parent-child relationship.",
      "The browser halts parsing completely and displays an unhandled parsing error screen.",
      "The `<div>` element is converted into an inline `<span>` tag while preserving text color.",
      "The paragraph element absorbs the `<div>` and converts it into a valid shadow DOM root."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Label Binding",
    questionText: "A web developer creates a user registration form, but users complain that clicking on the text label \"Email Address\" fails to place the cursor focus into the corresponding input text box:\n\n```html\n<label for=\"user_email\">Email Address</label>\n<input type=\"email\" id=\"email_input\" name=\"user_email\">\n```\n\nWhat is the exact accessibility bug causing this failure, and how should it be corrected?",
    options: [
      "The `<label>` attribute `for=\"user_email\"` matches the input's `name` attribute instead of its `id`; change `id=\"email_input\"` to `id=\"user_email\"` (or `for=\"email_input\"`).",
      "The `<input>` tag is missing `autocomplete=\"off\"`; add autocomplete attribute.",
      "`<label>` tags require `type=\"text\"` to register mouse click event listeners.",
      "The input tag must be placed inside a `<fieldset>` to link label clicks to input focus."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Native Validation",
    questionText: "An event registration website implements native HTML5 client-side form validation using the following input element:\n\n```html\n<input type=\"tel\" id=\"phone\" name=\"phone\" required pattern=\"[0-9]{10}\">\n```\n\nIf a user attempts to submit the form after typing `98765-ABCD` into the phone field, what occurs before the HTTP request is sent?",
    options: [
      "The browser blocks form submission, highlights the input box, and displays a native validation popup indicating the entry does not match the requested `pattern=\"[0-9]{10}\"` regex.",
      "The form submits successfully to the server, and the server strips the non-numeric characters automatically.",
      "The input field converts the text into a `NaN` value and submits the form silently.",
      "The browser triggers a JavaScript runtime error and reloads the page."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Viewport Meta",
    questionText: "A web designer tests a non-responsive website on a smartphone screen. Without a viewport meta tag in the `<head>`, the mobile browser renders the page as if it were on a 980px desktop screen, zooming out and making text unreadably small. Which `<meta>` tag configuration forces the browser to set the layout width to the physical device screen width with 1:1 initial scaling?",
    options: [
      "`<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">`",
      "`<meta name=\"screen\" content=\"fixed-width=100%, user-scalable=no\">`",
      "`<meta name=\"display\" content=\"responsive=true, zoom=100%\">`",
      "`<meta name=\"layout\" content=\"device-aspect-ratio=auto\">`"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Radio Grouping",
    questionText: "A developer builds a survey form asking users to select their preferred contact method using radio buttons:\n\n```html\n<fieldset>\n  <legend>Preferred Contact Method</legend>\n  <input type=\"radio\" id=\"email\" name=\"contact_email\" value=\"email\">\n  <label for=\"email\">Email</label>\n  <input type=\"radio\" id=\"phone\" name=\"contact_phone\" value=\"phone\">\n  <label for=\"phone\">Phone</label>\n</fieldset>\n```\n\nWhen testing the form, the user notices that selecting \"Phone\" does not uncheck \"Email\", allowing both options to be selected simultaneously. What causes this bug and how is it resolved?",
    options: [
      "Radio buttons must share the exact same `name` attribute (e.g., `name=\"contact_method\"`) to form a mutually exclusive radio group.",
      "Radio buttons require `type=\"checkbox\"` to support single-choice selection.",
      "The `<legend>` tag must contain `value=\"exclusive\"` to group inputs inside a fieldset.",
      "Each radio button must have a unique `value` attribute matching its `id`."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Open Graph",
    questionText: "A digital marketing team wants their company's home page to display a custom title, descriptive summary snippet, and high-resolution preview thumbnail image whenever users share the website link on social media platforms (such as LinkedIn, Facebook, or Twitter). Which HTML metadata standard is placed inside the `<head>` tag to control social link preview formatting?",
    options: [
      "Open Graph `<meta property=\"og:title\">`, `<meta property=\"og:image\">`, and `<meta property=\"og:description\">` tags.",
      "Semantic `<article>` tags containing Inline SVG image vectors.",
      "Microdata `<table class=\"social-preview\">` headers.",
      "`<link rel=\"stylesheet\" type=\"text/social\">` configurations."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Box Model",
    questionText: "Consider an element styled with the standard W3C CSS Box Model (`content-box` default):\n\n```css\n.card {\n  box-sizing: content-box;\n  width: 320px;\n  padding: 20px;\n  border: 5px solid #333;\n  margin: 15px;\n}\n```\n\nCalculate: (1) The total rendered width of the element box excluding margins, and (2) The total horizontal page space consumed including margins.",
    options: [
      "Rendered width: `370px`; Total horizontal space: `400px`.",
      "Rendered width: `320px`; Total horizontal space: `350px`.",
      "Rendered width: `345px`; Total horizontal space: `375px`.",
      "Rendered width: `370px`; Total horizontal space: `370px`."
    ],
    correctOptionIndex: 0
  },
  {
    title: "CSS Specificity",
    questionText: "Analyze the following HTML markup and accompanying CSS rules targeting the same paragraph element:\n\n```html\n<div id=\"main-content\" class=\"container\">\n  <p id=\"summary\" class=\"text-highlight\" style=\"color: purple;\">Expedition Details</p>\n</div>\n```\n\n```css\np#summary { color: red; }\ndiv.container p.text-highlight { color: blue; }\n#main-content p { color: green; }\n```\n\nWhich text color will the paragraph element display on the browser screen, and why?",
    options: [
      "Purple, because inline styles defined directly in the `style` attribute override all external ID and class selector rules.",
      "Red, because `p#summary` has the highest CSS specificity score among external rules.",
      "Blue, because `div.container p.text-highlight` uses multiple class and element selectors.",
      "Green, because `#main-content p` is declared last in the stylesheet."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Display Property",
    questionText: "A frontend developer applies different CSS display values to three consecutive navigation link elements (`<a href=\"#\">Link 1</a>`, etc.). Link A has `display: inline`, Link B has `display: block`, and Link C has `display: inline-block`. All links are assigned `width: 150px; height: 40px; padding: 10px;`. How will the browser handle width/height dimensions and layout flow for these three links?",
    options: [
      "Link A ignores `width`/`height`; Link B takes full line width and forces a new line; Link C respects custom `width`/`height` while staying in line flow.",
      "Link A takes full line width; Link B ignores `padding`; Link C disappears from layout.",
      "All three links expand to fill `150px` width and stack vertically on new lines.",
      "Link A and Link B render identically, while Link C causes a layout overflow error."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Absolute Positioning",
    questionText: "Consider the following HTML container and badge element:\n\n```html\n<div class=\"card\">\n  <span class=\"badge\">Sale</span>\n  <h2>Product Title</h2>\n</div>\n```\n\n```css\n.card {\n  width: 300px;\n  height: 200px;\n  position: static;\n}\n.badge {\n  position: absolute;\n  top: 10px;\n  right: 10px;\n}\n```\n\nWhere will the `.badge` element be positioned on the browser screen, and how can the CSS be modified so that `.badge` positions relative to `.card`?",
    options: [
      "`.badge` positions `10px` from the top-right of the browser viewport; change `.card` to `position: relative;`.",
      "`.badge` positions `10px` from the top-right of `.card`; no changes are necessary.",
      "`.badge` centers automatically inside `.card`; change `.badge` to `position: fixed;`.",
      "`.badge` disappears from the DOM tree; remove `top` and `right` properties."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Horizontal Centering",
    questionText: "A developer wants to center a fixed-width container `<div class=\"wrapper\">` horizontally within the browser window. Which CSS rule correctly achieves horizontal centering for a block-level element?",
    options: [
      "`.wrapper { width: 800px; margin-left: auto; margin-right: auto; }`",
      "`.wrapper { width: 800px; text-align: center; }`",
      "`.wrapper { width: 800px; align-items: center; }`",
      "`.wrapper { width: 800px; padding: auto; }`"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Font Units",
    questionText: "A web accessibility audit recommends using relative font units instead of fixed pixels. If the root HTML element is defined as `html { font-size: 16px; }`, an intermediate container has `.content { font-size: 20px; }`, and a child heading inside `.content` is styled with `h2 { font-size: 1.5rem; }`, what is the computed pixel font size of the `<h2>` heading?",
    options: [
      "`24px` (calculated as `1.5 * 16px` root font size).",
      "`30px` (calculated as `1.5 * 20px` parent font size).",
      "`16px` (matches root element font size).",
      "`32px` (calculated as `2 * 16px`)."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Sticky Positioning",
    questionText: "A news website implements a navigation bar `<header class=\"navbar\">` styled with the following CSS:\n\n```css\n.navbar {\n  position: sticky;\n  top: 0;\n  background-color: #2e7d32;\n}\n```\n\nHow does `position: sticky` behave when a user scrolls down a long article page, and how does it differ from `position: fixed`?",
    options: [
      "`position: sticky` acts as relative until its scroll offset reaches `top: 0`, then sticks to the top of its scrolling container; `position: fixed` is permanently anchored to the viewport regardless of scroll position.",
      "`position: sticky` permanently removes the element from normal document flow from the moment the page loads.",
      "`position: fixed` scrolls with the page content, whereas `position: sticky` hides the element when scrolling down.",
      "Both properties behave identically in all browsers without exception."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Active Pseudoclass",
    questionText: "Analyze the following button CSS styling and user interaction states:\n\n```css\n.btn {\n  background-color: green;\n  color: white;\n  transition: background-color 0.3s ease;\n}\n.btn:hover {\n  background-color: blue;\n}\n.btn:active {\n  background-color: red;\n}\n```\n\nWhen a user moves their mouse pointer over the button and holds down the primary mouse button, which background color will the button display during the active click?",
    options: [
      "Red, because `:active` triggers when an element is currently being clicked/activated by the user, overriding `:hover`.",
      "Blue, because `:hover` has higher CSS specificity than `:active`.",
      "Green, because initial class rules take precedence over pseudo-classes.",
      "White, matching the text color declaration."
    ],
    correctOptionIndex: 0
  }
];

// Helper to shuffle array in-place (Fisher-Yates)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 1. Process each question: shuffle options while preserving correct answer index
const processedQuestions = rawQuestions.map((q) => {
  const optionObjs = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correctOptionIndex }));
  const shuffledOptionObjs = shuffleArray(optionObjs);
  const newOptions = shuffledOptionObjs.map(o => o.text);
  const newCorrectIndex = shuffledOptionObjs.findIndex(o => o.isCorrect);

  return {
    type: "mcq",
    title: q.title,
    questionText: q.questionText,
    question: q.questionText,
    description: q.questionText, // Dual/triple compatibility for backend & UI schemas
    points: 1,
    options: newOptions,
    correctOptionIndex: newCorrectIndex
  };
});

// 2. Shuffle question order
const finalQuestions = shuffleArray(processedQuestions);

// Construct final test payload
const testPayload = {
  title: "R526CS03T - MST Quiz - 01",
  marks: 20,
  instructions: "This mid-semester diagnostic test consists of 20 multiple-choice questions covering Basics of Web Development (R526CS03T). Each question carries 1 mark. Total duration is 15 minutes. Ensure a stable network connection and remain in fullscreen mode throughout the test.",
  duration: 15,
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  questions: finalQuestions
};

// Post to Local Backend ONLY
const secret = process.env.API_ACCESS_SECRET || 'qwertty';
const localUrl = `http://127.0.0.1:5000/api/admin/tests?apiSecret=${encodeURIComponent(secret)}`;

async function deployTest() {
  console.log(`[LOCAL_TEST_DEPLOY]: Pushing quiz '${testPayload.title}' with ${testPayload.questions.length} questions to LOCAL backend...`);

  try {
    const resLocal = await fetch(localUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const dataLocal = await resLocal.json();
    if (resLocal.ok && dataLocal.success) {
      console.log(`[LOCAL_DEPLOY_SUCCESS]: Pushed successfully to local backend!`);
      console.log(`Test ID (_id): ${dataLocal.test._id || dataLocal.test.id}`);
    } else {
      console.error(`[LOCAL_DEPLOY_ERROR]: Local response:`, dataLocal);
    }
  } catch (errLocal) {
    console.error(`[LOCAL_DEPLOY_ERROR]: Local backend connection failed:`, errLocal.message);
  }
}

deployTest();
