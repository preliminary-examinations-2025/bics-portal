const fs = require('fs');

const rawQuestions = [
  {
    title: "Compilation Pipeline",
    questionText: "A software engineer writes a multi-file C++ project. In `main.cpp`, the program declares a prototype `void calculateTax();` and calls it inside `main()`. However, the engineer forgets to write the actual function definition in any `.cpp` file. During compilation, the preprocessor and compiler complete successfully without errors, but the build process fails at the final stage.\n\nWhich phase of the C++ compilation pipeline reports this failure, and why?",
    options: [
      "The Linker, because it cannot resolve the external reference symbol calculateTax() to a compiled object code definition.",
      "The Preprocessor, because header files were not included using #include.",
      "The Assembler, because assembly code cannot translate function calls without inline machine instructions.",
      "The Compiler, because syntax analysis requires all function bodies to be present in the same translation unit."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Operator Precedence",
    questionText: "Consider the following C++ code snippet involving integer arithmetic, floating-point type casting, and operator precedence rules:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int a = 7, b = 2;\n    double result = a / b + (double)a / b + 5 / 2;\n    cout << result;\n    return 0;\n}\n```\n\nWhat is the exact output printed on the console when this program executes?",
    options: [
      "8.5",
      "9.0",
      "8.0",
      "9.5"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Constant Modifiers",
    questionText: "A developer attempts to build a server capacity management utility in C++. The program declares a global constant for maximum lobby capacity and attempts to update it during runtime:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nconst int MAX_LOBBY_CAPACITY = 50;\n\nvoid updateServerNode(int extraPlayers) {\n    MAX_LOBBY_CAPACITY = MAX_LOBBY_CAPACITY + extraPlayers;\n    cout << \"Updated: \" << MAX_LOBBY_CAPACITY << endl;\n}\n\nint main() {\n    updateServerNode(25);\n    return 0;\n}\n```\n\nWhich compilation error occurs, and how should the code be corrected?",
    options: [
      "error: assignment of read-only variable 'MAX_LOBBY_CAPACITY'; remove const or use a separate local variable for updated capacity.",
      "error: MAX_LOBBY_CAPACITY was not declared in this scope; move the constant inside main().",
      "error: invalid conversion from int to const int; add explicit type casting (const int)extraPlayers.",
      "error: redefinition of updateServerNode; rename the function to updateServerNodeConst."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Modulo Arithmetic",
    questionText: "Analyze the following C++ program evaluating arithmetic operations and modulo remainder calculations:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int x = 17, y = 5;\n    int a = x % y;\n    int b = x / y;\n    int c = (x + 3) % (y + 1);\n    cout << a << \" \" << b << \" \" << c;\n    return 0;\n}\n```\n\nWhat is the exact output printed when this code is executed?",
    options: [
      "2 3 2",
      "3 3 2",
      "2 3 0",
      "3 2 0"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Variable Scope",
    questionText: "In C++, variables can be declared at different scope levels (global, local, block). What happens when a block-scoped variable inside an `if` statement is declared with the exact same identifier name as a previously declared local variable in the enclosing outer function scope, and how does this affect memory accessibility?",
    options: [
      "The block-scoped variable shadows the outer variable within that block; accessing the identifier inside the block modifies the inner variable, while the outer variable remains unchanged outside the block.",
      "The compiler throws a redefinition error because two variables with identical names can never exist within the same translation unit.",
      "The inner variable permanently overwrites the outer variable's memory location across the entire function.",
      "The outer variable takes precedence, causing all assignments inside the block to be ignored by the compiler."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Short-Circuit Logic",
    questionText: "Consider the following C++ program utilizing logical AND (`&&`) short-circuit evaluation alongside increment operators:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int x = 0, y = 10;\n    if (x++ && ++y) {\n        x += 5;\n    }\n    cout << \"x = \" << x << \", y = \" << y;\n    return 0;\n}\n```\n\nWhat is the exact output of this program?",
    options: [
      "x = 1, y = 10",
      "x = 1, y = 11",
      "x = 6, y = 11",
      "x = 0, y = 10"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Ternary Evaluation",
    questionText: "Determine the output of the following C++ program evaluating nested ternary (conditional) operator expressions:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int score = 75;\n    char grade = (score >= 90) ? 'A' : (score >= 70) ? 'B' : (score >= 50) ? 'C' : 'F';\n    cout << \"Grade: \" << grade;\n    return 0;\n}\n```\n\nWhat is the output printed on the console?",
    options: [
      "Grade: B",
      "Grade: A",
      "Grade: C",
      "Grade: F"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Switch Fallthrough",
    questionText: "Analyze the execution of the following C++ `switch` statement where `break` keywords have been intentionally omitted in certain cases:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int code = 2;\n    int val = 10;\n    switch (code) {\n        case 1: val += 5;\n        case 2: val *= 2;\n        case 3: val += 10; break;\n        case 4: val -= 5;\n        default: val += 1;\n    }\n    cout << \"val = \" << val;\n    return 0;\n}\n```\n\nWhat is the final value of `val` printed on the console?",
    options: [
      "val = 30",
      "val = 20",
      "val = 26",
      "val = 31"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Loop Mechanics",
    questionText: "A student writes the following C++ program intended to calculate the sum of numbers from $1$ to $5$. However, when executed, the program hangs indefinitely without producing any output:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int i = 1, sum = 0;\n    while (i <= 5);\n    {\n        sum += i;\n        i++;\n    }\n    cout << \"Sum = \" << sum;\n    return 0;\n}\n```\n\nWhat is the logical bug causing this infinite loop, and how can it be fixed?",
    options: [
      "The trailing semicolon after while (i <= 5); creates an empty loop body where i <= 5 is evaluated continuously without updating i; remove the semicolon.",
      "The variable sum is initialized to 0 instead of 1; change initialization to sum = 1.",
      "The loop condition i <= 5 should be i < 5; change condition.",
      "i++ should be placed before sum += i; swap the statements inside block."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Control Flow",
    questionText: "Trace the execution of the following nested loops incorporating loop control statements (`break` and `continue`):\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int total = 0;\n    for (int r = 1; r <= 3; r++) {\n        for (int c = 1; c <= 3; c++) {\n            if (c == 2) continue;\n            if (r == 3) break;\n            total += r * c;\n        }\n    }\n    cout << \"total = \" << total;\n    return 0;\n}\n```\n\nWhat is the final value of `total` printed on the screen?",
    options: [
      "total = 12",
      "total = 18",
      "total = 8",
      "total = 24"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Iterative Control",
    questionText: "What is the fundamental difference between an entry-controlled loop (`while`) and an exit-controlled loop (`do-while`) in C++ when the loop condition evaluates to false on the very first evaluation?",
    options: [
      "The while loop executes 0 times because the condition is tested before entering the loop body, whereas the do-while loop executes at least 1 time because the condition is tested after the body runs.",
      "The do-while loop executes 0 times, whereas the while loop executes infinitely.",
      "Both loops execute exactly 1 time regardless of where the condition is placed.",
      "The while loop requires dynamic memory allocation, whereas the do-while loop uses stack registers."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Arithmetic Iteration",
    questionText: "Trace the step-by-step execution of the following digit-processing loop program:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 482;\n    int product = 1;\n    while (n > 0) {\n        int digit = n % 10;\n        if (digit % 2 == 0) {\n            product *= digit;\n        }\n        n /= 10;\n    }\n    cout << \"product = \" << product;\n    return 0;\n}\n```\n\nWhat is the final output of this program?",
    options: [
      "product = 64",
      "product = 384",
      "product = 16",
      "product = 0"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Iteration Count",
    questionText: "Consider the following C++ code snippet containing nested loops:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int count = 0;\n    for (int i = 0; i < 4; i++) {\n        for (int j = i; j < 4; j++) {\n            count++;\n        }\n    }\n    cout << \"count = \" << count;\n    return 0;\n}\n```\n\nHow many times is `count++` executed, and what is the final printed output?",
    options: [
      "count = 10",
      "count = 16",
      "count = 12",
      "count = 6"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Function Overloading",
    questionText: "A C++ developer defines overloaded functions to display numbers of different numeric types:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nvoid display(int val) {\n    cout << \"Int: \" << val << endl;\n}\n\nvoid display(float val) {\n    cout << \"Float: \" << val << endl;\n}\n\nint main() {\n    display(3.14);\n    return 0;\n}\n```\n\nWhy does the compiler produce a build error when compiling this program?",
    options: [
      "error: call of overloaded 'display(double)' is ambiguous; literal 3.14 is a double, which can implicitly convert to both int and float with equal priority.",
      "error: display cannot be overloaded; C++ does not support functions sharing the same identifier.",
      "error: missing return type in display; functions must explicitly return an integer status code.",
      "error: invalid conversion from float to int; explicit type casting is mandatory for function arguments."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Parameter Passing",
    questionText: "Trace the execution of the following C++ program demonstrating parameter passing mechanisms (`pass-by-value` vs `pass-by-reference`):\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nvoid modifyValues(int a, int &b) {\n    a += 10;\n    b += 10;\n}\n\nint main() {\n    int x = 5, y = 5;\n    modifyValues(x, y);\n    cout << \"x = \" << x << \", y = \" << y;\n    return 0;\n}\n```\n\nWhat is the exact output displayed on the console?",
    options: [
      "x = 5, y = 15",
      "x = 15, y = 15",
      "x = 5, y = 5",
      "x = 15, y = 5"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Recursion Analysis",
    questionText: "Determine the output produced by the following recursive C++ function when invoked from `main()`:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint mystery(int n) {\n    if (n <= 1) return 1;\n    return n + mystery(n - 2);\n}\n\nint main() {\n    cout << \"Result = \" << mystery(6);\n    return 0;\n}\n```\n\nWhat is the output printed by the program?",
    options: [
      "Result = 13",
      "Result = 12",
      "Result = 21",
      "Result = 15"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Array Bounds",
    questionText: "A developer writes a function to compute the peak value in an array of daily steps:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint findMax(int arr[], int size) {\n    int maxVal = arr[0];\n    for (int i = 1; i <= size; i++) {\n        if (arr[i] > maxVal) {\n            maxVal = arr[i];\n        }\n    }\n    return maxVal;\n}\n\nint main() {\n    int steps[4] = {5000, 8200, 10400, 7100};\n    cout << \"Max: \" << findMax(steps, 4);\n    return 0;\n}\n```\n\nWhat critical runtime defect exists in `findMax`, and how should it be corrected?",
    options: [
      "The loop condition i <= size accesses arr[4], which is out-of-bounds for an array of size 4; change condition to i < size.",
      "arr[0] cannot be assigned to maxVal; initialize maxVal = 0.",
      "Arrays cannot be passed to functions without the & reference operator; change parameter to int &arr[].",
      "The loop index should start at i = 0 instead of i = 1; change start index."
    ],
    correctOptionIndex: 0
  },
  {
    title: "Matrix Traversal",
    questionText: "Analyze the output of the following 2D array matrix processing program:\n\n```cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    int grid[2][3] = {\n        {2, 4, 6},\n        {1, 3, 5}\n    };\n    int total = 0;\n    for (int r = 0; r < 2; r++) {\n        for (int c = 0; c < 3; c++) {\n            if (grid[r][c] % 2 == 0) {\n                total += grid[r][c];\n            } else {\n                total -= 1;\n            }\n        }\n    }\n    cout << \"total = \" << total;\n    return 0;\n}\n```\n\nWhat is the final value of `total` printed on the console?",
    options: [
      "total = 9",
      "total = 12",
      "total = 15",
      "total = 21"
    ],
    correctOptionIndex: 0
  },
  {
    title: "Search Complexity",
    questionText: "A software engineer needs to search for a specific customer ID inside a database array containing $1,000,000$ pre-sorted integer records. Comparing algorithm efficiency, how many comparison steps will Binary Search require in the worst-case scenario compared to Linear Search?",
    options: [
      "Binary Search requires at most 20 comparisons ($O(\\log_2 N)$), whereas Linear Search requires 1,000,000 comparisons ($O(N)$).",
      "Binary Search requires 1,000 comparisons ($O(\\sqrt{N})$), whereas Linear Search requires 500,000 comparisons.",
      "Both Binary Search and Linear Search require 1,000,000 comparisons because memory access speed is constant.",
      "Binary Search requires $1,000,000^2$ comparisons ($O(N^2)$), whereas Linear Search requires 1 comparison."
    ],
    correctOptionIndex: 0
  },
  {
    title: "String Bounds",
    questionText: "Analyze the output of the following C++ program operating on character arrays (C-style strings):\n\n```cpp\n#include <iostream>\n#include <cstring>\nusing namespace std;\n\nint main() {\n    char str[] = \"C++Lab\";\n    str[3] = '\\0';\n    cout << str << \" | Size: \" << sizeof(str) << \" | Len: \" << strlen(str);\n    return 0;\n}\n```\n\nWhat is the exact printed output of this code?",
    options: [
      "C++ | Size: 7 | Len: 3",
      "C++Lab | Size: 6 | Len: 6",
      "C++ | Size: 3 | Len: 3",
      "C++Lab | Size: 7 | Len: 3"
    ],
    correctOptionIndex: 0
  }
];

// Helper: Fisher-Yates shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 1. Process each question: shuffle its options while preserving correct answer index
const processedQuestions = rawQuestions.map((q) => {
  const optionObjs = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correctOptionIndex }));
  const shuffledOptionObjs = shuffleArray(optionObjs);
  const newOptions = shuffledOptionObjs.map(o => o.text);
  const newCorrectIndex = shuffledOptionObjs.findIndex(o => o.isCorrect);

  return {
    type: "mcq",
    title: q.title,
    questionText: q.questionText,
    question: q.questionText, // Dual parameter for backend compatibility
    points: 1,
    options: newOptions,
    correctOptionIndex: newCorrectIndex
  };
});

// 2. Shuffle the order of questions
const finalQuestions = shuffleArray(processedQuestions);

// Construct final test payload
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
