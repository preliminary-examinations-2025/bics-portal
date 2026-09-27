const fs = require('fs');

const rawQuestions = [
  {
    title: "Logical Transformation",
    questionText: "A formal verification algorithm evaluates a digital system rule: \"If a microchip overheats, then the system triggers an emergency thermal shutdown.\" The system debugger needs to rewrite this conditional statement into its logically equivalent contrapositive form to construct an automated theorem prover rule. Which logical assertion represents the valid contrapositive that preserves the exact truth value of the original rule?",
    options: [
      "If the system does not trigger an emergency thermal shutdown, then the microchip does not overheat.",
      "If the microchip does not overheat, then the system does not trigger an emergency thermal shutdown.",
      "If the system triggers an emergency thermal shutdown, then the microchip overheats.",
      "The microchip overheats if and only if the system triggers an emergency thermal shutdown."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Policy Verification",
    questionText: "A cybersecurity access matrix rule states: \"For every database administrator $u$, there exists at least one encrypted log file $f$ such that administrator $u$ can access log file $f$.\" An auditor wants to verify the exact logical negation of this security policy to identify compliance violations. Which statement correctly expresses the logical negation of this quantified assertion?",
    options: [
      "There exists at least one database administrator $u$ such that for all encrypted log files $f$, administrator $u$ cannot access log file $f$.",
      "For every database administrator $u$ and every encrypted log file $f$, administrator $u$ cannot access log file $f$.",
      "There exists at least one encrypted log file $f$ such that every database administrator $u$ can access log file $f$.",
      "There exists at least one database administrator $u$ and at least one encrypted log file $f$ such that $u$ can access $f$."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Signal Evaluation",
    questionText: "A digital logic circuit designer analyzes a control signal expression given by $(P \\rightarrow Q) \\land (Q \\rightarrow R) \\land (P \\land \\neg R)$. The hardware team wants to determine whether this boolean expression can ever evaluate to true under any combination of input signals $P$, $Q$, and $R$. What is the truth status of this logical expression?",
    options: [
      "It is a contradiction because it evaluates to false under all possible truth value assignments of $P$, $Q$, and $R$.",
      "It is a tautology because it evaluates to true under all possible truth value assignments of $P$, $Q$, and $R$.",
      "It is satisfiable because setting $P = \\text{true}$, $Q = \\text{false}$, and $R = \\text{false}$ makes the entire expression evaluate to true.",
      "It is logically equivalent to the simple proposition $P \\lor R$."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Recurrence Step",
    questionText: "A computer scientist uses mathematical induction to prove that a recursive sorting algorithm executes in at most $S(n) = 2^n - 1$ operations for $n$ input elements. During the inductive step, the scientist assumes the statement holds for $n = k$ and must now demonstrate that $S(k+1) = 2^{k+1} - 1$. Given the recurrence relation $S(k+1) = 2 \\cdot S(k) + 1$, what algebraic substitution completes the inductive proof?",
    options: [
      "Substitute $S(k) = 2^k - 1$ into $2(2^k - 1) + 1 = 2^{k+1} - 2 + 1 = 2^{k+1} - 1$.",
      "Substitute $S(k) = 2^k + 1$ into $2(2^k + 1) - 1 = 2^{k+1} + 2 - 1 = 2^{k+1} + 1$.",
      "Substitute $S(k) = k^2$ into $2(k^2) + 1 = 2k^2 + 1$.",
      "Substitute $S(k) = 2^{k-1}$ into $2(2^{k-1}) + 1 = 2^k + 1$."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Ratio Contradiction",
    questionText: "A software developer is constructing a formal proof to demonstrate that $\\sqrt{2}$ cannot be expressed as a ratio of two integers $\\frac{p}{q}$. The developer assumes the negation that $\\sqrt{2} = \\frac{p}{q}$ in lowest terms where $\\gcd(p, q) = 1$. After squaring both sides to obtain $p^2 = 2q^2$, what critical logical deduction leads directly to the contradiction?",
    options: [
      "Both $p$ and $q$ must be even numbers, contradicting the assumption that $\\gcd(p, q) = 1$.",
      "$p$ must be odd while $q$ must be even, contradicting the rules of integer multiplication.",
      "$p^2$ is an odd integer while $2q^2$ is an even integer, violating equality.",
      "$p$ and $q$ are both prime numbers, violating the fundamental theorem of arithmetic."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Filter Conversion",
    questionText: "A database search engine processes the complex Boolean user filtering query `NOT (status = 'active' AND role = 'admin')` to retrieve inactive user accounts. To optimize index scanning speed, the query compiler converts this expression into an equivalent disjunctive form without nested parentheses. Which converted Boolean search filter expression maintains exact logical equivalence according to De Morgan's Laws?",
    options: [
      "`status != 'active' OR role != 'admin'`",
      "`status != 'active' AND role != 'admin'`",
      "`status = 'active' OR role = 'admin'`",
      "`NOT (status = 'active') AND role = 'admin'`"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Inference Deduction",
    questionText: "A cloud server platform enforces the following operational rule: \"If the server cluster memory usage exceeds $90\\%$, then the automatic load balancer deploys additional virtual nodes.\" During a diagnostic audit, an engineer observes that the automatic load balancer did not deploy additional virtual nodes. What valid logical conclusion can be inferred using the Modus Tollens rule of inference?",
    options: [
      "The server cluster memory usage did not exceed $90\\%$.",
      "The server cluster memory usage exceeded $90\\%$, but the deployment failed.",
      "The automatic load balancer is currently malfunctioning.",
      "The server cluster memory usage is operating at exactly $50\\%$."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Product Cardinality",
    questionText: "A software engineer creates a set of database permission tags $A = \\{r, w, x\\}$ and a set of user roles $B = \\{1, 2\\}$. The application generates a configuration space defined by the Cartesian product $A \\times B$. The engineer then constructs the power set of this Cartesian product, denoted as $\\mathcal{P}(A \\times B)$. How many elements are contained in the power set $\\mathcal{P}(A \\times B)$?",
    options: [
      "$64$",
      "$32$",
      "$12$",
      "$16$"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Relational Structure",
    questionText: "A software system defines a binary relation $R$ on the set of positive integer process IDs $\\mathbb{Z}^+$ such that $(a, b) \\in R$ if and only if $a \\equiv b \\pmod{4}$ (that is, $a$ and $b$ leave the same remainder when divided by $4$). What combination of relational properties does $R$ satisfy on the set of integer process IDs?",
    options: [
      "Reflexive, Symmetric, and Transitive (Equivalence Relation).",
      "Reflexive, Antisymmetric, and Transitive (Partial Order Relation).",
      "Irreflexive, Symmetric, and Transitive.",
      "Reflexive, Symmetric, but not Transitive."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Mapping Classification",
    questionText: "A cryptography system designs a hash mapping function $f: \\mathbb{Z}_{10} \\rightarrow \\mathbb{Z}_{10}$ defined by $f(x) = (3x + 7) \\bmod 10$, where domain and codomain are the set of integers $\\{0, 1, 2, \\dots, 9\\}$. A security analyst tests whether every hash key has a unique output and whether every value in the codomain is reached. How is this hash mapping function classified?",
    options: [
      "Bijective (both one-to-one and onto), making it invertible.",
      "Injective (one-to-one) but not surjective (onto).",
      "Surjective (onto) but not injective (one-to-one).",
      "Neither injective nor surjective."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Pipeline Composition",
    questionText: "An encryption module uses two functions operating on real numbers: $f(x) = 2x + 5$ and $g(x) = \\frac{x - 3}{4}$. A security officer wants to compute the composite function $(f \\circ g)(x)$ to analyze the combined data transformation, and then determine its inverse $(f \\circ g)^{-1}(x)$. Which mathematical expression represents the inverse of the composite function $(f \\circ g)^{-1}(x)$?",
    options: [
      "$(f \\circ g)^{-1}(x) = 2x - 7$",
      "$(f \\circ g)^{-1}(x) = \\frac{4x - 7}{2}$",
      "$(f \\circ g)^{-1}(x) = \\frac{x + 7}{2}$",
      "$(f \\circ g)^{-1}(x) = 4x + 14$"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Server Overlap",
    questionText: "A network administrator inspects security traffic logs across $100$ enterprise servers. Detailed analysis reveals that $60$ servers run Web services ($W$), $45$ servers run Database services ($D$), and $20$ servers run neither Web nor Database services. Using set operations and Venn diagram principles, how many servers run both Web services and Database services ($W \\cap D$) simultaneously?",
    options: [
      "$25$ servers",
      "$15$ servers",
      "$35$ servers",
      "$20$ servers"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Passcode Complexity",
    questionText: "A security engineer configures system authentication rules for a corporate portal. A valid employee passcode must consist of exactly $4$ distinct uppercase letters chosen from the $26$-letter English alphabet followed by $3$ distinct numeric digits chosen from \\{0, 1, \\dots, 9\\}. How many total unique passcodes can be created under these strict positional constraints without character repetition?",
    options: [
      "$P(26, 4) \\times P(10, 3) = 258,336,000$",
      "$C(26, 4) \\times C(10, 3) = 1,794,000$",
      "$26^4 \\times 10^3 = 456,976,000$",
      "$P(26, 4) + P(10, 3) = 359,520$"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Buffer Bound",
    questionText: "A network router receives a rapid burst of $1,000$ incoming data packets within a microsecond window. The router hardware routes these incoming packets into $12$ parallel processing buffer queues. Applying the Generalized Pigeonhole Principle, what is the guaranteed minimum number of data packets that must end up assigned to at least one buffer queue?",
    options: [
      "$84$ packets (calculated as $\\lceil 1000 / 12 \\rceil$)",
      "$83$ packets",
      "$100$ packets",
      "$90$ packets"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Service Dependency",
    questionText: "A software architect evaluates $50$ microservices in a cloud application. Testing shows $30$ microservices rely on Cache Service $A$, $25$ microservices rely on Database Service $B$, and $18$ microservices rely on Message Broker $C$. Furthermore, $12$ use $A \\land B$, $10$ use $B \\land C$, $8$ use $A \\land C$, and $5$ use all three services. How many microservices rely on at least one of these three infrastructure services?",
    options: [
      "$48$ microservices",
      "$42$ microservices",
      "$50$ microservices",
      "$35$ microservices"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Diagnostic Sensitivity",
    questionText: "A static code analyzer scans a repository for critical software vulnerabilities. Historical data shows that $5\\%$ of code modules contain critical security bugs. When a module contains a bug, the analyzer detects it with $90\\%$ probability (sensitivity). When a module is clean, the analyzer falsely flags it with $5\\%$ probability (false positive rate). If the analyzer flags a module as buggy, what is the conditional probability that it actually contains a critical bug?",
    options: [
      "$48.65\\%$",
      "$90.00\\%$",
      "$50.00\\%$",
      "$4.50\\%$"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Posterior Classification",
    questionText: "An AI email filter processes incoming messages where $20\\%$ of all emails are spam ($S$) and $80\\%$ are legitimate ($L$). The specific keyword \"URGENT\" appears in $70\\%$ of spam emails, but also appears in $10\\%$ of legitimate emails. If a newly arrived email contains the keyword \"URGENT\", what is the posterior probability that the email is spam?",
    options: [
      "$63.64\\%$ (calculated as $\\frac{7}{11}$)",
      "$70.00\\%$",
      "$50.00\\%$",
      "$20.00\\%$"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Committee Selection",
    questionText: "A software research laboratory staff consists of $6$ senior systems engineers and $4$ data analytics scientists. The project director randomly selects a task force committee of $3$ team members from this pool without replacement. What is the exact mathematical probability that the selected task force committee contains exactly $2$ senior systems engineers and $1$ data analytics scientist?",
    options: [
      "$\\frac{1}{2}$ (or $50.00\\%$)",
      "$\\frac{3}{10}$ (or $30.00\\%$)",
      "$\\frac{3}{5}$ (or $60.00\\%$)",
      "$\\frac{1}{4}$ (or $25.00\\%$)"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Cluster Availability",
    questionText: "A high-availability web service relies on $4$ independent redundant server nodes running in parallel. Each individual server node has an operational failure probability of $0.1$ ($10\\%$) during peak load hours. The cluster remains online as long as at least one server node functions correctly. What is the probability that the web service cluster remains online during peak load?",
    options: [
      "$99.99\\%$ (or $0.9999$)",
      "$90.00\\%$ (or $0.9000$)",
      "$99.90\\%$ (or $0.9990$)",
      "$65.61\\%$ (or $0.6561$)"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Circular Arrangement",
    questionText: "A cybersecurity team of $6$ engineers, including a lead architect and a chief auditor, holds a round-table incident response meeting. To coordinate response protocol, the team seats themselves around a circular conference table. How many distinct seating arrangements are possible if the lead architect and chief auditor must always sit directly adjacent to each other?",
    options: [
      "$48$ arrangements (calculated as $(5 - 1)! \\times 2!$)",
      "$120$ arrangements",
      "$24$ arrangements",
      "$240$ arrangements"
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
  title: "R526CS04T - MST Quiz - 01",
  marks: 20,
  instructions: "This mid-semester diagnostic test consists of 20 multiple-choice questions covering Mathematical Thinking / Discrete Mathematics (R526CS04T). Each question carries 1 mark. Total duration is 15 minutes. Ensure a stable network connection and remain in fullscreen mode throughout the test.",
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
