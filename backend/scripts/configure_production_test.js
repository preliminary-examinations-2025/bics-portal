/**
 * Script to configure a comprehensive test on the production backend
 * API: https://bicsportal.netlify.app/api
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'https://bicsportal.netlify.app/api';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const sampleTestPayload = {
    title: "R526CS01T - Comprehensive Systems, Algorithms & Web Assessment",
    course: "Introduction to Computer Science (Theory)",
    courseCode: "R526CS01T",
    duration: 60, // 60 minutes
    marks: 100,
    startDate: new Date("2026-11-01T00:00:00.000Z").toISOString(),
    endDate: new Date("2026-12-31T23:59:59.000Z").toISOString(),
    instructions: "Official BICS comprehensive online testing session. Validates single/multi-choice objective evaluation, real-time C++ & Python code compilation, Web Studio live preview, and continuous camera/microphone proctoring telemetry. Maintain fullscreen focus throughout.",
    isPublished: true,
    questions: [
        // -------------------------------------------------------------
        // Q1: Single Choice (MCQ / SCC) with LaTeX
        // -------------------------------------------------------------
        {
            id: "q_cs01_scc_1",
            type: "mcq",
            category: "Single Choice",
            title: "Algorithmic Complexity & Tree Lookup",
            description: "What is the worst-case asymptotic time complexity of searching for an element in a strictly balanced Binary Search Tree (such as an AVL Tree or Red-Black Tree) containing \\(N\\) elements?",
            points: 15,
            options: [
                "\\(\\mathcal{O}(1)\\)",
                "\\(\\mathcal{O}(\\log_2 N)\\)",
                "\\(\\mathcal{O}(N)\\)",
                "\\(\\mathcal{O}(N \\log_2 N)\\)"
            ],
            correctOptionIndex: 1,
            correctOptionIndices: [1],
            isMultiChoice: false
        },
        // -------------------------------------------------------------
        // Q2: Multiple Choice (MCC) with Checkboxes
        // -------------------------------------------------------------
        {
            id: "q_cs01_mcc_2",
            type: "mcc",
            category: "Multiple Choice",
            title: "Network Protocols & Transport Security",
            description: "Which of the following statements regarding modern Transport Layer and application protocols are TRUE? (Select all that apply)",
            points: 15,
            options: [
                "TCP establishes a connection via a three-way handshake (SYN, SYN-ACK, ACK) and guarantees in-order segment delivery.",
                "UDP implements built-in congestion control mechanisms to prevent packet saturation on wide-area networks.",
                "TLS 1.3 deprecates legacy ciphers and provides cryptographic forward secrecy via ephemeral Diffie-Hellman.",
                "HTTP/3 operates over the QUIC transport protocol utilizing UDP instead of classic TCP."
            ],
            correctOptionIndices: [0, 2, 3],
            isMultiChoice: true
        },
        // -------------------------------------------------------------
        // Q3: Programming (Coding - C++)
        // -------------------------------------------------------------
        {
            id: "q_cs01_code_cpp_3",
            type: "coding",
            category: "Programming",
            title: "String Word Reversal in C++",
            description: "Write a complete C++ program that reads a line of space-delimited words from standard input (`cin`) and prints the words in reverse order to standard output (`cout`), preserving the internal spelling of each individual word.",
            points: 25,
            language: "cpp",
            timeLimitMs: 2000,
            memoryLimitMb: 128,
            initialTemplate: `#include <iostream>
#include <vector>
#include <string>
#include <sstream>

using namespace std;

int main() {
    string line;
    if (!getline(cin, line)) return 0;
    
    stringstream ss(line);
    string word;
    vector<string> words;
    while (ss >> word) {
        words.push_back(word);
    }
    
    for (int i = (int)words.size() - 1; i >= 0; --i) {
        cout << words[i] << (i > 0 ? " " : "");
    }
    cout << endl;
    return 0;
}`,
            testCases: [
                {
                    input: "BICS Online Assessment Platform",
                    output: "Platform Assessment Online BICS",
                    isSample: true,
                    points: 10
                },
                {
                    input: "Data Structures and Algorithms",
                    output: "Algorithms and Structures Data",
                    isSample: false,
                    points: 15
                }
            ]
        },
        // -------------------------------------------------------------
        // Q4: Programming (Coding - Python)
        // -------------------------------------------------------------
        {
            id: "q_cs01_code_py_4",
            type: "coding",
            category: "Programming",
            title: "Two Sum Target Pair in Python",
            description: "Given a sequence of integers and a target sum, determine the 0-based indices of the two numbers such that they add up to the target value. Input format: First line contains integer N, second line contains N integers, third line contains the target.",
            points: 20,
            language: "python",
            timeLimitMs: 2000,
            memoryLimitMb: 128,
            initialTemplate: `import sys

def solve():
    lines = sys.stdin.read().split()
    if not lines:
        return
    n = int(lines[0])
    nums = [int(x) for x in lines[1:n+1]]
    target = int(lines[n+1])
    
    lookup = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in lookup:
            print(f"{lookup[complement]} {i}")
            return
        lookup[num] = i

if __name__ == '__main__':
    solve()`,
            testCases: [
                {
                    input: "4\n2 7 11 15\n9",
                    output: "0 1",
                    isSample: true,
                    points: 10
                },
                {
                    input: "3\n3 2 4\n6",
                    output: "1 2",
                    isSample: false,
                    points: 10
                }
            ]
        },
        // -------------------------------------------------------------
        // Q5: Web Development (Web Studio - HTML/CSS/JS)
        // -------------------------------------------------------------
        {
            id: "q_cs01_web_5",
            type: "web",
            category: "Web Development",
            title: "Interactive Responsive Counter Card",
            description: "Design an interactive, responsive counter component. The counter card must display an initial numerical count of 0, an Increment button (+), a Decrement button (-), and a Reset button. The display must update instantaneously upon click with clean styling.",
            points: 25,
            initialHtml: `<div class="counter-container">
  <div class="counter-card">
    <div class="counter-badge">Active Widget</div>
    <h1 id="count-display">0</h1>
    <div class="controls-row">
      <button id="btn-decrement" class="action-btn dec-btn">-</button>
      <button id="btn-reset" class="action-btn reset-btn">Reset</button>
      <button id="btn-increment" class="action-btn inc-btn">+</button>
    </div>
  </div>
</div>`,
            initialCss: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
body {
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
.counter-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 32px 40px;
  text-align: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.counter-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #0284c7;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
#count-display {
  font-size: 54px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 24px;
  font-variant-numeric: tabular-nums;
}
.controls-row {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.action-btn {
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 600;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  color: #334155;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.action-btn:hover {
  background: #e2e8f0;
}
.inc-btn {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.dec-btn {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}`,
            initialJs: `let currentCount = 0;
const countDisplay = document.getElementById('count-display');
const btnInc = document.getElementById('btn-increment');
const btnDec = document.getElementById('btn-decrement');
const btnReset = document.getElementById('btn-reset');

function updateDisplay() {
  countDisplay.textContent = currentCount;
}

btnInc.addEventListener('click', () => {
  currentCount++;
  updateDisplay();
});

btnDec.addEventListener('click', () => {
  currentCount--;
  updateDisplay();
});

btnReset.addEventListener('click', () => {
  currentCount = 0;
  updateDisplay();
});`
        }
    ]
};

async function configureProductionTest() {
    console.log("==========================================================================");
    console.log("🚀 CONFIGURING COMPREHENSIVE TEST IN PRODUCTION BACKEND");
    console.log(`🌐 Target API: ${API_BASE}`);
    console.log("==========================================================================");

    // 1. Authenticate as Admin
    console.log(`\n[STEP 1] Authenticating as Admin (${ADMIN_USER})...`);
    const loginRes = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });

    if (!loginRes.ok) {
        const errText = await loginRes.text();
        throw new Error(`Admin login failed (${loginRes.status}): ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log(`  ✅ Successfully authenticated. Admin JWT acquired (Role: ${loginData.user?.role}).`);

    // 2. Fetch existing tests
    console.log("\n[STEP 2] Fetching existing tests from production...");
    const listRes = await fetch(`${API_BASE}/admin/tests`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`Failed to list tests (${listRes.status}): ${errText}`);
    }

    const existingTests = await listRes.json();
    console.log(`  ℹ️ Found ${existingTests.length} tests in production backend.`);

    const existingMatch = existingTests.find(t => 
        t.title === sampleTestPayload.title || 
        t.title.includes("Comprehensive Systems, Algorithms") ||
        (t.courseCode === "R526CS01T" && t.title.includes("Comprehensive"))
    );

    let testToSave = { ...sampleTestPayload };
    if (existingMatch) {
        console.log(`  ℹ️ Matching existing test found: ${existingMatch.title} (ID: ${existingMatch._id || existingMatch.id}). Updating in place.`);
        testToSave._id = existingMatch._id || existingMatch.id;
        testToSave.id = existingMatch._id || existingMatch.id;
    } else {
        console.log("  ℹ️ Creating new comprehensive test configuration.");
    }

    // 3. Save Test via Admin POST /admin/tests
    console.log("\n[STEP 3] Uploading comprehensive test configuration...");
    const saveRes = await fetch(`${API_BASE}/admin/tests`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(testToSave)
    });

    if (!saveRes.ok) {
        const errText = await saveRes.text();
        throw new Error(`Failed to save test (${saveRes.status}): ${errText}`);
    }

    const savedResult = await saveRes.json();
    const savedTest = savedResult.test || savedResult;
    const testId = savedTest._id || savedTest.id;
    console.log(`  ✅ Test configuration saved successfully! (ID: ${testId})`);

    // 4. Ensure Test is Published
    console.log("\n[STEP 4] Ensuring test is published for examinees...");
    const publishRes = await fetch(`${API_BASE}/admin/tests/toggle-publish/${testId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isPublished: true })
    });

    if (publishRes.ok) {
        console.log("  ✅ Published status confirmed active.");
    }

    // 5. Verification & Summary
    console.log("\n[STEP 5] Verifying test configuration in production...");
    const verifyRes = await fetch(`${API_BASE}/tests/${testId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (verifyRes.ok) {
        const fetched = await verifyRes.json();
        console.log("  --------------------------------------------------");
        console.log(`  Title:         ${fetched.title}`);
        console.log(`  Course Code:   ${fetched.courseCode}`);
        console.log(`  Course Name:   ${fetched.course}`);
        console.log(`  Duration:      ${fetched.duration} minutes`);
        console.log(`  Total Marks:   ${fetched.marks}`);
        console.log(`  Published:     ${fetched.isPublished}`);
        console.log(`  Questions (${(fetched.questions || []).length}):`);
        (fetched.questions || []).forEach((q, i) => {
            console.log(`    [Q${i+1}] Type: ${q.type.padEnd(8)} | Category: ${(q.category || '').padEnd(16)} | Title: ${q.title}`);
        });
        console.log("  --------------------------------------------------");
    }

    console.log("\n==========================================================================");
    console.log("🎉 PRODUCTION TEST CONFIGURATION COMPLETED SUCCESSFULLY!");
    console.log("==========================================================================");
}

configureProductionTest().catch(err => {
    console.error("❌ Error configuring production test:", err);
    process.exit(1);
});
