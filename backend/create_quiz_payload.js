const fs = require('fs');

const questionsRaw = [
    {
        title: "IoT Hexadecimal Sensor Data Conversion",
        scenario: "An embedded IoT sensor monitoring a smart water reservoir transmits real-time depth readings as hexadecimal values over a low-bandwidth wireless channel to save battery power. If the sensor sends the hexadecimal string 0x1A4F representing the raw digital fluid level, an engineer needs to compute its equivalent decimal value for the analytics server. What is the correct decimal representation of this transmitted data payload?",
        options: ["6735", "6720", "6991", "6719"],
        correctOptionIndex: 0
    },
    {
        title: "Satellite Telemetry Download Time Calculation",
        scenario: "A satellite orbiting Earth collects high-resolution imagery and stores 30 Gigabytes (GB) of telemetry data in its onboard solid-state vault. The ground station can download data at a continuous transfer rate of 100 Megabits per second (Mbps). Assuming standard binary byte prefix definitions (1 GB = 1024^3 Bytes and 1 Byte = 8 bits), approximately how many minutes will it take to transmit the entire dataset to the ground?",
        options: ["42.95 minutes", "25.76 minutes", "51.20 minutes", "4.29 minutes"],
        correctOptionIndex: 0
    },
    {
        title: "ISA Specification vs Hardware Organization",
        scenario: "Two microchip manufacturers release processors that execute the exact same x86-64 instruction set architecture (ISA), ensuring all software binaries run identically without modification. However, Chipmaker A uses a 5-stage pipeline with single-level execution units, while Chipmaker B implements a dual-issue out-of-order execution pipeline with speculative branch prediction. Which fundamental computer engineering principle explains why their internal operational mechanisms differ despite running identical software?",
        options: [
            "Computer Architecture is identical, but Computer Organization is different.",
            "Computer Organization is identical, but Computer Architecture is different.",
            "Hardware-software co-design requires operating system abstraction.",
            "Microcode emulation alters proprietary firmware while maintaining Open Source ISA."
        ],
        correctOptionIndex: 0
    },
    {
        title: "GPLv2 Licensing & Source Code Obligations",
        scenario: "A biomedical tech firm develops a diagnostic medical device powered by a modified Linux kernel (GPLv2 licensed) bundled with proprietary AI disease-detection algorithms. A competitor claims the company must release their entire source code, including the proprietary neural network model. Based on software licensing frameworks, which statement correctly evaluates the company's legal obligations regarding source code distribution?",
        options: [
            "They must release the AI model code because GPLv2 forces all executable code on the machine to become open source.",
            "They must release modifications made to the Linux kernel, but separate proprietary user-space AI applications can remain closed source.",
            "Proprietary software can never legally run on a Linux-based operating system without violating copyright laws.",
            "The GPLv2 license automatically converts proprietary user software into public domain hardware firmware."
        ],
        correctOptionIndex: 1
    },
    {
        title: "Vacuum Tube to Integrated Circuit Evolution",
        scenario: "A computer historian analyzes an ancient military calculating engine that suffered frequent hardware failures due to thermionic emission breakdown and immense thermal output, requiring continuous vacuum tube replacement. The historian contrasts this with a late 1960s mainframe that integrated hundreds of transistors onto a single silicon wafer chip. Which generation transition in computing history does this comparison illustrate?",
        options: [
            "Transition from First Generation (Vacuum Tubes) to Third Generation (Integrated Circuits).",
            "Transition from Second Generation (Transistors) to Fourth Generation (VLSI Microprocessors).",
            "Transition from First Generation (Vacuum Tubes) to Second Generation (Discrete Transistors).",
            "Transition from Zero Generation (Mechanical Relays) to Fifth Generation (ULSI Systems)."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Firmware Classification & System Initialization",
        scenario: "When a modern workstation boots up, a low-level software component stored in a non-volatile flash ROM chip initializes system hardware, performs a Power-On Self-Test (POST), and identifies bootable media before handing control to the operating system loader. How is this intermediate software layer classified, and what is its relationship to application software?",
        options: [
            "It is System Software (Firmware/UEFI) that provides essential low-level hardware control required before any Application Software can execute.",
            "It is Application Software that executes inside virtual memory to emulate operating system kernel instructions.",
            "It is Open Source Utility Software that manages user file allocations and secondary memory partitioning.",
            "It is Proprietary Middleware that translates high-level C++ code directly into assembly language during runtime."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Raw Data vs Meaningful Information Concepts",
        scenario: "An automated weather monitoring station gathers raw analog voltage signals from anemometers and thermistors every millisecond, outputting raw numerical matrices such as [101.3, 298.15, 0.04]. An environmental engine converts these values into a structured hurricane warning alert: \"Category 2 Storm Approaching Coastal District at 140 km/h.\" Which core computing concept distinguishes the raw numerical matrices from the final hurricane warning alert?",
        options: [
            "The numerical matrices represent raw Data, whereas the processed hurricane warning represents meaningful Information.",
            "The numerical matrices represent Information, whereas the processed hurricane warning represents raw Data.",
            "The voltage signals are digital Software, whereas the text alert is physical Hardware.",
            "The numerical matrices represent Computer Architecture, whereas the text alert represents Computer Organization."
        ],
        correctOptionIndex: 0
    },
    {
        title: "ALU Computation & Control Unit Signal Timing",
        scenario: "During the execution of an arithmetic instruction ADD R1, R2, the Central Processing Unit (CPU) fetches the instruction code, decodes the operation, and routes the operand values stored in registers to an internal hardware sub-component designed to perform binary addition. Which specific component within the CPU core performs this mathematical computation, and which unit coordinates the overall fetch-decode-execute timing signals?",
        options: [
            "Arithmetic Logic Unit (ALU) performs computation; Control Unit (CU) coordinates timing signals.",
            "Control Unit (CU) performs computation; Cache Memory coordinates timing signals.",
            "Instruction Register (IR) performs computation; Program Counter (PC) coordinates timing signals.",
            "Memory Management Unit (MMU) performs computation; ALU coordinates timing signals."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Processor Cache Hierarchy & Latency Tradeoffs",
        scenario: "A financial high-frequency trading firm upgrades its server processors to minimize latency. The new CPU features a multi-level cache architecture with L1, L2, and L3 caches. If an algorithm attempts to read a market price variable, in what sequence will the processor check memory locations, and why is L1 cache significantly faster yet smaller in capacity than main memory (RAM)?",
        options: [
            "Sequence: L1 -> L2 -> L3 -> RAM; L1 is built with fast SRAM integrated on the CPU die, making it expensive and small.",
            "Sequence: RAM -> L3 -> L2 -> L1; L1 uses magnetic domain storage requiring high refresh rates.",
            "Sequence: L3 -> L2 -> L1 -> RAM; L1 is built with cheap DRAM requiring dynamic capacitive charging cycles.",
            "Sequence: Registers -> RAM -> L1 -> L2; L1 uses optical storage media operating at light speeds."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Volatile RAM vs Non-Volatile EEPROM Parameters",
        scenario: "An industrial robot controller loses electrical power suddenly during a factory blackout. When power is restored, the robot's RAM memory is found completely wiped clean, yet the device successfully boots up its basic operating parameters stored in onboard EEPROM. Which fundamental characteristic of primary storage explains why RAM lost its data while EEPROM retained its contents?",
        options: [
            "RAM is Volatile memory requiring continuous power to maintain state, whereas EEPROM is Non-Volatile memory.",
            "RAM is Non-Volatile secondary storage, whereas EEPROM is Volatile cache memory.",
            "RAM is Read-Only Memory, whereas EEPROM is Random-Access Read-Write Memory.",
            "RAM uses magnetic platters, whereas EEPROM uses optical laser grooves to retain electron charges."
        ],
        correctOptionIndex: 0
    },
    {
        title: "HDD Seek Latency vs SSD NAND Flash Performance",
        scenario: "A video editing studio compares two storage arrays for editing 8K raw video footage. Drive Array A utilizes spinning magnetic platters with motorized read/write heads, suffering from mechanical seek latency. Drive Array B utilizes NAND flash memory cells with no moving parts, offering near-instantaneous random access. How do these two secondary storage technologies compare in terms of operational mechanics and performance?",
        options: [
            "Drive Array A is a Hard Disk Drive (HDD) with mechanical latency; Drive Array B is a Solid State Drive (SSD) with zero moving parts.",
            "Drive Array A is a Solid State Drive (SSD); Drive Array B is a Magnetic Tape Drive.",
            "Drive Array A is Primary Cache Storage; Drive Array B is Volatile Main Memory.",
            "Drive Array A uses Flash Memory; Drive Array B uses Dynamic RAM (DRAM) capacitors."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Thunderbolt 4 / USB4 Multi-Protocol Consolidation",
        scenario: "A graphics designer connects a high-refresh-rate 4K monitor, an external NVMe storage enclosure, and a high-speed audio interface to a laptop using a single universal cable capable of transferring data at 40 Gbps while simultaneously supplying up to 100W of charging power. Which modern hardware port and bus technology enables this multi-protocol high-bandwidth consolidation?",
        options: [
            "Thunderbolt 4 / USB4 over USB Type-C connector.",
            "Legacy VGA Port using RS-232 serial communication.",
            "PS/2 Keyboard Port using parallel ISA bus.",
            "eSATA Port using IDE ribbon interconnect."
        ],
        correctOptionIndex: 0
    },
    {
        title: "PCI Express Expansion Slot Bus Throughput",
        scenario: "A computer system builder installs a dedicated graphics processing unit (GPU) onto a motherboard. To ensure maximum data throughput between the CPU and the GPU for real-time ray-tracing rendering, the card is slotted directly into a high-speed expansion slot directly connected to the CPU's primary PCIe lanes. Which bus or expansion interface on the motherboard handles this ultra-fast graphics interconnect?",
        options: [
            "PCI Express (PCIe) Expansion Slot.",
            "Legacy PCI 33MHz Slot.",
            "Universal Serial Bus (USB 2.0) Header.",
            "Parallel ATA (PATA) IDE Connector."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Operating System Kernel Privilege & Resource Management",
        scenario: "While a user plays a 3D video game, listens to background music on a streaming app, and downloads a software update simultaneously, the operating system manages CPU execution time, allocates isolation boundaries in memory, and prevents the media player from overwriting game data. Which core operating system component acts as this central resource manager operating in privileged hardware mode?",
        options: [
            "The Kernel.",
            "The Command Line Shell.",
            "The Graphical User Interface (GUI).",
            "The File Allocation Table (FAT)."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Executable Programs, Processes & Concurrent Threads",
        scenario: "A software developer opens a web browser application executable stored on an SSD. When launched, the operating system creates an active instance in memory with its own process ID (PID), allocated heap, and virtual address space. Within this single running browser instance, multiple concurrent execution tabs run independently to render web pages. How are the static file, active instance, and individual tabs classified?",
        options: [
            "Static file is a Program; active instance is a Process; concurrent execution tabs are Threads.",
            "Static file is a Process; active instance is a Thread; concurrent execution tabs are Programs.",
            "Static file is a Thread; active instance is a Program; concurrent execution tabs are Kernels.",
            "Static file is Virtual Memory; active instance is Cache; concurrent execution tabs are Drivers."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Linux Working Directory Absolute Path Resolution",
        scenario: "A new Linux user opens a terminal window to organize project files. After navigating through multiple nested subdirectories inside the system file hierarchy, the user gets confused about their current folder location. Which simple Linux command line utility should the user type to immediately print the complete absolute path of their current working directory on the terminal screen?",
        options: [
            "pwd",
            "cd",
            "ls",
            "whoami"
        ],
        correctOptionIndex: 0
    },
    {
        title: "Preemptive Round Robin Time Slice Scheduling",
        scenario: "An operating system scheduler manages a queue of CPU-bound tasks. To prevent long-running computational background tasks from starving short interactive user tasks, the scheduler assigns a fixed time quantum (e.g., 10 milliseconds) to each process in turn. If a process does not complete within its time slice, it is preempted and moved to the back of the queue. Which process scheduling algorithm is being utilized?",
        options: [
            "Round Robin (RR) Preemptive Scheduling.",
            "First-Come, First-Served (FCFS) Non-Preemptive Scheduling.",
            "Shortest Job First (SJF) Non-Preemptive Scheduling.",
            "Priority Non-Preemptive Batch Scheduling."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Real-Time OS Deterministic Latency Guarantees",
        scenario: "An aerospace engineer designs an embedded flight stabilization system for an autonomous drone. The system must process gyroscope sensor interrupts and adjust motor pulse widths within a deterministic deadline of less than 2 milliseconds; missing a deadline could cause a catastrophic crash. Why is a Real-Time Operating System (RTOS) like FreeRTOS chosen for this flight controller instead of a standard desktop operating system like Windows or Ubuntu?",
        options: [
            "An RTOS provides deterministic event response times and strict latency guarantees required for safety-critical tasks.",
            "Desktop operating systems lack graphic display drivers necessary for processing flight data streams.",
            "An RTOS uses large memory swap spaces to prevent background applications from crashing the CPU.",
            "Desktop operating systems cannot run on ARM microcontrollers because they are proprietary software."
        ],
        correctOptionIndex: 0
    },
    {
        title: "Directory & File Creation Utilities in Linux",
        scenario: "A student starting a new programming lab session opens the Linux terminal shell. The student needs to create a new folder named cpp_lab to hold their source code files, and then create an empty file named main.cpp inside that new folder. Which pair of fundamental Linux command line utilities will successfully accomplish directory creation and empty file creation?",
        options: [
            "mkdir cpp_lab and touch main.cpp",
            "rmdir cpp_lab and cat main.cpp",
            "chmod cpp_lab and grep main.cpp",
            "pwd cpp_lab and ls main.cpp"
        ],
        correctOptionIndex: 0
    },
    {
        title: "Single Root Tree Directory Hierarchy Architecture",
        scenario: "A user migrating from Microsoft Windows to Linux searches for their secondary hard drive partition. On Windows, additional drives are mounted as separate drive letters like D:\\ or E:\\. On Linux, however, all storage devices, partitions, hardware interfaces, and virtual file structures are unified under a single root directory denoted by a forward slash /. Which fundamental storage architectural concept distinguishes the Linux directory structure from Windows?",
        options: [
            "Linux uses a Single Inverted Tree Directory Hierarchy starting at root (/), mounting all storage devices inside unified mount points.",
            "Windows stores all system files inside hidden BIOS ROM chips, whereas Linux requires secondary drive letters.",
            "Linux does not support secondary hard drives and relies entirely on virtual memory swap files.",
            "Windows formats all secondary drives using Linux ext4 file systems by default."
        ],
        correctOptionIndex: 0
    }
];

// Fisher-Yates Shuffle Algorithm
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 1. Shuffle Options per question AND update correctOptionIndex accordingly
const processedQuestions = questionsRaw.map((q) => {
    const correctAnswerText = q.options[q.correctOptionIndex];
    const shuffledOptions = shuffleArray(q.options);
    const newCorrectIndex = shuffledOptions.indexOf(correctAnswerText);

    return {
        title: q.title,
        scenario: q.scenario,
        options: shuffledOptions,
        correctOptionIndex: newCorrectIndex
    };
});

// 2. Shuffle the Questions array order and populate 'question', 'questionText', AND 'description' with q.scenario
const shuffledQuestionsList = shuffleArray(processedQuestions).map((q, idx) => ({
    id: `q_quiz01_${idx + 1}_${Date.now()}`,
    type: 'mcq',
    title: q.title,
    question: q.scenario,
    questionText: q.scenario,
    description: q.scenario,
    points: 1,
    section: '', // Stripped module/section names
    options: q.options,
    correctOptionIndex: q.correctOptionIndex,
    isMultiChoice: false
}));

const testPayload = {
    _id: "6ab6a35ce8638ab9e7c2569e",
    id: "6ab6a35ce8638ab9e7c2569e",
    title: "R526CS01T - MST Quiz - 01",
    marks: 20,
    duration: 15,
    instructions: "Preliminary Examinations 2026 - R526CS01T Foundations of Computing MST Quiz 01.\nTotal Questions: 20 Multiple Choice Questions (1 Mark each).\nDuration: 15 Minutes.\nTotal Marks: 20.\nNote: Ensure a stable network connection. Proctoring warnings are active during the examination.",
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isPublished: true,
    questions: shuffledQuestionsList
};

// Distribution audit of correct answer indices
const indexCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
testPayload.questions.forEach(q => {
    indexCounts[q.correctOptionIndex] = (indexCounts[q.correctOptionIndex] || 0) + 1;
});

console.log("==================================================");
console.log(`Payload Title: ${testPayload.title}`);
console.log(`Questions Count: ${testPayload.questions.length}`);
console.log("Option Index Distribution:", indexCounts);
console.log("Sample Question Title:", testPayload.questions[0].title);
console.log("Sample Question ('question'):", testPayload.questions[0].question.substring(0, 60) + "...");
console.log("Sample Question ('questionText'):", testPayload.questions[0].questionText.substring(0, 60) + "...");
console.log("Sample Question ('description'):", testPayload.questions[0].description.substring(0, 60) + "...");
console.log("==================================================");

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
