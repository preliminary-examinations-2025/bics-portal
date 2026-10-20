const { KataQuestionBankModel } = require('../models/KataQuestionBank');

const INITIAL_SHIN_QUESTIONS = [
    // --- Category A (100 Points) ---
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Watermelon Slices',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'One hot summer day Pete and his friend Billy decided to buy a watermelon. They chose the biggest and the ripest one, in their opinion. After that the watermelon was weighed, and the scales showed $w$ kilos. They rushed home, dying of thirst, and decided to divide the berry, however they faced a hard problem.\n\nPete and Billy are great fans of even numbers, that\'s why they want to divide the watermelon in such a way that each of the two parts weighs an even number of kilos, of course it is not obligatory that the parts are equal in size. The parts must have positive weights.\n\nHelp Pete and Billy find out if they can divide the watermelon in the way they want.',
        inputFormat: 'The first (and only) input line contains integer number $w$ ($1 \\le w \\le 100$) — the weight of the watermelon bought by the boys.',
        outputFormat: 'Print `YES`, if the boys can divide the watermelon into two parts, each of them weighing an even number of kilos; and `NO` in the opposite case.',
        sampleInput: '8\n',
        sampleOutput: 'YES\n',
        note: 'For example, the boys can divide the watermelon into two parts of $2$ and $6$ kilos respectively (another variant — two parts of $4$ and $4$ kilos). Note that if $w = 2$, the only division is $1 + 1$, where neither is even.',
        hiddenTestCases: [
            { input: '2\n', output: 'NO\n' },
            { input: '4\n', output: 'YES\n' },
            { input: '7\n', output: 'NO\n' },
            { input: '100\n', output: 'YES\n' },
            { input: '1\n', output: 'NO\n' }
        ],
        tags: ['math', 'brute force'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Way Too Long Words',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Sometimes some words like "localization" or "internationalization" are so long that writing them many times in one text is quite tiresome.\n\nLet\'s consider a word too long, if its length is strictly more than $10$ characters. All too long words should be replaced with a special abbreviation.\n\nThis abbreviation is made like this: we write down the first and the last letter of a word and between them we write the number of letters between the first and the last letters. That number is in decimal system and doesn\'t contain any leading zeroes.\n\nThus, "localization" will be spelt as "l10n", and "internationalization" will be spelt as "i18n".',
        inputFormat: 'The first line contains an integer $n$ ($1 \\le n \\le 100$). Each of the following $n$ lines contains one word consisting of lowercase Latin letters of length between $1$ and $100$.',
        outputFormat: 'Print $n$ lines. The $i$-th line should contain the result of replacing of the $i$-th word from the input data.',
        sampleInput: '4\nword\nlocalization\ninternationalization\npneumonoultramicroscopicsilicovolcanoconiosis\n',
        sampleOutput: 'word\nl10n\ni18n\np43s\n',
        note: 'Notice that "word" has length 4, which is $\\le 10$, so it remains unchanged.',
        hiddenTestCases: [
            { input: '2\ncat\nhippopotamus\n', output: 'cat\nh10s\n' },
            { input: '1\nabcdefghij\n', output: 'abcdefghij\n' },
            { input: '1\nabcdefghijk\n', output: 'a9k\n' }
        ],
        tags: ['strings'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Bit++ Processor',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'The classic language Bit++ is under development. A single integer variable $x$ initially equals $0$. A program consists of $n$ statements. Each statement is one of four operations: `++X`, `X++`, `--X`, or `X--`.\n\nExecuting `++X` or `X++` increases $x$ by $1$. Executing `--X` or `X--` decreases $x$ by $1$.\n\nYour task is to compute the final value of $x$ after executing all $n$ statements.',
        inputFormat: 'The first line contains a single integer $n$ ($1 \\le n \\le 150$) — the number of statements.\nNext $n$ lines each contain one statement.',
        outputFormat: 'Print the final value of $x$.',
        sampleInput: '1\n++X\n',
        sampleOutput: '1\n',
        note: '$x$ starts at 0, incremented once gives 1.',
        hiddenTestCases: [
            { input: '2\nX++\n--X\n', output: '0\n' },
            { input: '3\n++X\n++X\n++X\n', output: '3\n' },
            { input: '4\nX--\n--X\nX--\n--X\n', output: '-4\n' }
        ],
        tags: ['implementation'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Next Round Qualification',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: '"Contestant who earns a score equal to or greater than the $k$-th place finisher\'s score will advance to the next round, as long as the contestant earns a positive score..." — an excerpt from contest rules.\n\nA total of $n$ participants took part in the contest ($n \\ge k$), and you already know their scores in non-increasing order. Calculate how many participants advance to the next round.',
        inputFormat: 'The first line contains two integers $n$ and $k$ ($1 \\le k \\le n \\le 50$) separated by a space.\nThe second line contains $n$ space-separated integers $a_1, a_2, \\dots, a_n$ ($0 \\le a_i \\le 100$), where $a_i$ is the score of the participant who earned the $i$-th place.',
        outputFormat: 'Output the number of participants who advance to the next round.',
        sampleInput: '8 5\n10 9 8 7 7 7 5 5\n',
        sampleOutput: '6\n',
        note: 'The 5-th participant has 7 points. Participants 1 to 6 all scored $\\ge 7$ and $> 0$.',
        hiddenTestCases: [
            { input: '4 2\n0 0 0 0\n', output: '0\n' },
            { input: '5 1\n1 1 1 1 1\n', output: '5\n' },
            { input: '6 3\n5 4 3 2 1 0\n', output: '3\n' }
        ],
        tags: ['arrays', 'implementation'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Domino Piling',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You are given a rectangular board of $M \\times N$ squares. You are also given an unlimited number of standard domino pieces of $2 \\times 1$ squares.\n\nYou are allowed to rotate the pieces. You are asked to place as many dominoes as possible on the board so as to satisfy the following conditions:\n1. Each domino completely covers two squares.\n2. No two dominoes overlap.\n3. Each domino lies entirely inside the board.\n\nFind the maximum number of dominoes which can be placed.',
        inputFormat: 'In a single line you are given two integers $M$ and $N$ ($1 \\le M \\le N \\le 16$).',
        outputFormat: 'Output one number — the maximal number of dominoes, which can be put.',
        sampleInput: '2 4\n',
        sampleOutput: '4\n',
        note: 'Total squares $2 \\times 4 = 8$. We can fit $\\lfloor 8 / 2 \\rfloor = 4$ dominoes.',
        hiddenTestCases: [
            { input: '3 3\n', output: '4\n' },
            { input: '1 1\n', output: '0\n' },
            { input: '5 7\n', output: '17\n' }
        ],
        tags: ['math', 'greedy'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Elephant Coordinate Jumps',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'An elephant decided to visit his friend. It turned out that the elephant\'s house is located at point $0$ and his friend\'s house is located at point $x$ ($x > 0$) of the coordinate line. In one step the elephant can move $1, 2, 3, 4$ or $5$ positions forward.\n\nDetermine what is the minimum number of steps he need to make in order to get to his friend\'s house.',
        inputFormat: 'The first line of the input contains an integer $x$ ($1 \\le x \\le 1\\,000\\,000$) — the coordinate of the friend\'s house.',
        outputFormat: 'Print the minimum number of steps that elephant needs to make to get from point $0$ to point $x$.',
        sampleInput: '5\n',
        sampleOutput: '1\n',
        note: 'Elephant can take one step of length 5.',
        hiddenTestCases: [
            { input: '12\n', output: '3\n' },
            { input: '1\n', output: '1\n' },
            { input: '1000000\n', output: '200000\n' }
        ],
        tags: ['math'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Word Capitalization',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Capitalization is writing a word with its first letter as a capital letter. Your task is to capitalize the given word.\n\nNote, that during capitalization all the letters except the first one remain unchanged.',
        inputFormat: 'A single line contains a non-empty word consisting of lowercase and uppercase Latin letters. Its length is at most $10^3$.',
        outputFormat: 'Output the given word after capitalization.',
        sampleInput: 'ApPLe\n',
        sampleOutput: 'ApPLe\n',
        note: 'The first letter is already capitalized, so no change.',
        hiddenTestCases: [
            { input: 'konjac\n', output: 'Konjac\n' },
            { input: 'z\n', output: 'Z\n' },
            { input: 'aBC\n', output: 'ABC\n' }
        ],
        tags: ['strings', 'implementation'],
        difficulty: '800'
    },
    {
        track: 'shin',
        letter: 'A',
        points: 100,
        title: 'Bear and Big Brother',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Bear Limak wants to become the largest of bears, or at least to become larger than his brother Bob.\n\nRight now, Limak and Bob weigh $a$ and $b$ respectively. It\'s guaranteed that Limak\'s weight is smaller than or equal to his brother\'s weight ($a \\le b$).\n\nLimak eats a lot and his weight is tripled after every year, while Bob\'s weight is doubled after every year.\n\nAfter how many full years will Limak become strictly larger than Bob ($a > b$)?',
        inputFormat: 'The only line of the input contains two integers $a$ and $b$ ($1 \\le a \\le b \\le 10$) — the weight of Limak and the weight of Bob respectively.',
        outputFormat: 'Print one integer, denoting the integer number of years after which Limak will become strictly larger than Bob.',
        sampleInput: '4 7\n',
        sampleOutput: '2\n',
        note: 'In the first year Limak weighs $4 \\cdot 3 = 12$ and Bob weighs $7 \\cdot 2 = 14$. In the second year Limak weighs $12 \\cdot 3 = 36$ and Bob weighs $14 \\cdot 2 = 28$. $36 > 28$, so 2 years.',
        hiddenTestCases: [
            { input: '4 9\n', output: '3\n' },
            { input: '1 1\n', output: '1\n' },
            { input: '2 10\n', output: '5\n' }
        ],
        tags: ['math', 'simulation'],
        difficulty: '800'
    },

    // --- Category B (200 Points) ---
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Taxi Ride Sharing',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'After the contest, $n$ groups of school children want to take taxis back home. The $i$-th group consists of $s_i$ ($1 \\le s_i \\le 4$) children.\n\nEach taxi can take at most $4$ passengers. What is the minimum number of taxis required to transport all $n$ groups, if children from one group must ride together in the same taxi (though children from different groups can share a taxi)?',
        inputFormat: 'The first line contains an integer $n$ ($1 \\le n \\le 10^5$).\nThe second line contains $n$ integers $s_1, s_2, \\dots, s_n$ ($1 \\le s_i \\le 4$).',
        outputFormat: 'Print the single number — the minimum number of taxis necessary.',
        sampleInput: '5\n1 2 4 3 3\n',
        sampleOutput: '4\n',
        note: 'Group of 4 takes 1 taxi. Two groups of 3 each take 1 taxi, one takes group of 1 along. Group of 2 takes 1 taxi. Total: 4.',
        hiddenTestCases: [
            { input: '8\n2 3 4 4 2 1 3 1\n', output: '5\n' },
            { input: '1\n1\n', output: '1\n' },
            { input: '4\n1 1 1 1\n', output: '1\n' }
        ],
        tags: ['greedy', 'two pointers'],
        difficulty: '1100'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Queue at the School',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'During the break $n$ school children stood in a line. In this queue boys ($B$) and girls ($G$) stand in arbitrary order.\n\nEach second, if a boy stands right before a girl (i.e. the substring `BG` appears), they swap places so that the girl stands ahead of the boy. After $t$ seconds, what will the queue look like?',
        inputFormat: 'The first line contains two integers $n$ and $t$ ($1 \\le n, t \\le 50$).\nThe second line contains string $s$ of length $n$ containing characters \'B\' and \'G\'.',
        outputFormat: 'Print string $s$ after $t$ seconds have passed.',
        sampleInput: '5 1\nBGGBG\n',
        sampleOutput: 'GBGGB\n',
        note: 'Initial: BGGBG. After 1 second, first BG becomes GB, and second BG becomes GB $\\implies$ GBGGB.',
        hiddenTestCases: [
            { input: '5 2\nBGGBG\n', output: 'GGBGB\n' },
            { input: '4 1\nGGGG\n', output: 'GGGG\n' },
            { input: '4 3\nBBBB\n', output: 'BBBB\n' }
        ],
        tags: ['simulation', 'strings'],
        difficulty: '1000'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Maximum Distinct Subarray Sum',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You are given an array $a$ of $n$ integers. You want to choose two non-overlapping contiguous subarrays such that the sum of their elements is maximized, or output the maximum sum achievable in a contiguous subarray where all elements are positive.',
        inputFormat: 'The first line contains an integer $n$ ($1 \\le n \\le 10^5$).\nThe second line contains $n$ space-separated integers $a_1, a_2, \\dots, a_n$ ($-10^9 \\le a_i \\le 10^9$).',
        outputFormat: 'Print the maximum possible contiguous subarray sum (standard Kadane sum).',
        sampleInput: '5\n1 -2 3 5 -1\n',
        sampleOutput: '8\n',
        note: 'Subarray $[3, 5]$ has sum $3 + 5 = 8$.',
        hiddenTestCases: [
            { input: '3\n-5 -2 -8\n', output: '-2\n' },
            { input: '1\n100\n', output: '100\n' },
            { input: '4\n2 3 -1 4\n', output: '8\n' }
        ],
        tags: ['dynamic programming', 'greedy'],
        difficulty: '1100'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Interesting Drink Binary Search',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Vasiliy likes to rest after a hard work day. There are $n$ shops in the city selling his favorite drink. The price of one bottle in the $i$-th shop is $x_i$ coins.\n\nVasiliy plans to buy the drink for $q$ consecutive days. On the $j$-th day he will have $m_j$ coins. For each day, determine how many shops he can afford to buy a drink in.',
        inputFormat: 'The first line contains an integer $n$ ($1 \\le n \\le 10^5$).\nThe second line contains $n$ integers $x_1, x_2, \\dots, x_n$ ($1 \\le x_i \\le 10^5$).\nThe third line contains an integer $q$ ($1 \\le q \\le 10^5$).\nEach of the next $q$ lines contains a single integer $m_j$ ($1 \\le m_j \\le 10^9$).',
        outputFormat: 'For each of the $q$ queries print a single integer — the number of shops where Vasiliy can buy a bottle.',
        sampleInput: '5\n3 10 8 6 11\n4\n1\n10\n3\n11\n',
        sampleOutput: '0\n4\n1\n5\n',
        note: 'On day 1 with 1 coin: 0 shops. On day 2 with 10 coins: prices 3, 10, 8, 6 $\\implies$ 4 shops.',
        hiddenTestCases: [
            { input: '3\n5 5 5\n2\n4\n5\n', output: '0\n3\n' },
            { input: '1\n100\n1\n1000\n', output: '1\n' }
        ],
        tags: ['binary search', 'sorting'],
        difficulty: '1100'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Worms Piles Lookup',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'It is lunchtime. $n$ piles of delicious worms are laid out in a row. The $i$-th pile has $a_i$ worms. The worms are labeled with consecutive positive integers starting from $1$ in order of piles.\n\nYou are given $m$ juice-seeking birds, the $j$-th bird wants worm number $q_j$. For each bird, print the pile number the worm belongs to.',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). The second line contains $a_1, \\dots, a_n$ ($1 \\le a_i \\le 10^3$). The third line contains $m$ ($1 \\le m \\le 10^5$). The fourth line contains $q_1, \\dots, q_m$.',
        outputFormat: 'Print $m$ lines, the $j$-th line contains the pile index for worm $q_j$.',
        sampleInput: '5\n2 7 3 4 9\n3\n1\n25\n11\n',
        sampleOutput: '1\n5\n3\n',
        note: 'Pile 1: 1-2. Pile 2: 3-9. Pile 3: 10-12. Pile 4: 13-16. Pile 5: 17-25.',
        hiddenTestCases: [
            { input: '2\n5 5\n2\n3\n7\n', output: '1\n2\n' },
            { input: '1\n10\n1\n10\n', output: '1\n' }
        ],
        tags: ['binary search', 'prefix sums'],
        difficulty: '1200'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Sort the Array Reversal',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Being a programmer, you love sorted arrays. You are given an array $a$ of $n$ distinct integers. You can reverse exactly one contiguous subsegment of $a$ (or reverse a segment of length $1$).\n\nCan you make the array sorted in non-decreasing order?',
        inputFormat: 'The first line contains integer $n$ ($1 \\le n \\le 10^5$). The second line contains $n$ distinct integers $a_1, \\dots, a_n$ ($1 \\le a_i \\le 10^9$).',
        outputFormat: 'If impossible, print `no`. Otherwise print `yes` on first line, and on second line two 1-based indices $l$ and $r$ defining the reversed segment.',
        sampleInput: '3\n3 2 1\n',
        sampleOutput: 'yes\n1 3\n',
        note: 'Reversing segment $[1, 3]$ gives $[1, 2, 3]$.',
        hiddenTestCases: [
            { input: '4\n2 1 3 4\n', output: 'yes\n1 2\n' },
            { input: '4\n3 1 2 4\n', output: 'no\n' }
        ],
        tags: ['sorting', 'implementation'],
        difficulty: '1200'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'BerSU Ball Matching',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'The Berland State University is hosting a ball. There are $n$ boys and $m$ girls. The $i$-th boy has dancing skill $a_i$, and the $j$-th girl has dancing skill $b_j$.\n\nA pair of boy $i$ and girl $j$ can form a dance couple if $|a_i - b_j| \\le 1$. Each boy and girl can be in at most one couple. What is the maximum number of couples that can be formed?',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 100$). Second line contains $a_1, \\dots, a_n$. Third line contains $m$ ($1 \\le m \\le 100$). Fourth line contains $b_1, \\dots, b_m$.',
        outputFormat: 'Print the maximum number of couples.',
        sampleInput: '4\n1 4 6 2\n5\n5 1 5 7 9\n',
        sampleOutput: '3\n',
        note: 'Pairs: (1, 1), (4, 5), (6, 5) or (6, 7). Total: 3 couples.',
        hiddenTestCases: [
            { input: '1\n5\n1\n6\n', output: '1\n' },
            { input: '2\n1 10\n2\n5 20\n', output: '0\n' }
        ],
        tags: ['greedy', 'two pointers', 'sorting'],
        difficulty: '1200'
    },
    {
        track: 'shin',
        letter: 'B',
        points: 200,
        title: 'Two Buttons Calculator',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Vasya has found a strange device. On its screen is an integer $n$. Vasya wants the screen to show an integer $m$.\n\nThe device has two buttons:\n- Red button: multiplies the displayed number by $2$.\n- Blue button: subtracts $1$ from the displayed number.\n\nFind the minimum number of presses required to obtain $m$ starting from $n$.',
        inputFormat: 'The first line contains two integers $n$ and $m$ ($1 \\le n, m \\le 10^4$).',
        outputFormat: 'Print the minimum number of button presses.',
        sampleInput: '4 6\n',
        sampleOutput: '2\n',
        note: '$4 - 1 = 3$, $3 \\times 2 = 6$. 2 presses.',
        hiddenTestCases: [
            { input: '10 1\n', output: '9\n' },
            { input: '2 8\n', output: '2\n' },
            { input: '3 5\n', output: '3\n' }
        ],
        tags: ['bfs', 'greedy', 'math'],
        difficulty: '1300'
    },

    // --- Category C (300 Points) ---
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Given Length and Sum of Digits',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You have a positive integer $m$ (length) and an integer $s$ (sum of digits). Find the smallest and the largest non-negative integers of length $m$ with sum of digits equal to $s$. The numbers must not contain leading zeroes (except single digit 0 when $m = 1$).',
        inputFormat: 'The single line contains two integers $m$ and $s$ ($1 \\le m \\le 100$, $0 \\le s \\le 900$).',
        outputFormat: 'Print two space-separated integers: the minimum and the maximum number. If no such numbers exist, print `-1 -1`.',
        sampleInput: '2 15\n',
        sampleOutput: '69 96\n',
        note: '$6 + 9 = 15$. Minimum 2-digit number is 69, maximum is 96.',
        hiddenTestCases: [
            { input: '1 0\n', output: '0 0\n' },
            { input: '3 0\n', output: '-1 -1\n' },
            { input: '2 19\n', output: '-1 -1\n' }
        ],
        tags: ['dp', 'greedy'],
        difficulty: '1400'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Woodcutters Tree Falling',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Little Vasya plays as a woodcutter. Along the road there are $n$ trees located at coordinates $x_1 < x_2 < \\dots < x_n$, each having height $h_i$.\n\nVasya can fell each tree to the left or to the right, or leave it standing. A felled tree takes interval $(x_i - h_i, x_i)$ or $(x_i, x_i + h_i)$. No two trees can occupy the same coordinate. What is the maximum number of trees Vasya can fell?',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). Next $n$ lines contain pairs $x_i, h_i$ ($1 \\le x_i, h_i \\le 10^9$).',
        outputFormat: 'Print the maximum number of felled trees.',
        sampleInput: '5\n1 2\n2 1\n5 10\n10 9\n19 1\n',
        sampleOutput: '3\n',
        note: 'First tree felled to the left, last to the right, and 2nd to the left: 3 trees.',
        hiddenTestCases: [
            { input: '1\n1 1\n', output: '1\n' },
            { input: '2\n1 5\n10 5\n', output: '2\n' }
        ],
        tags: ['dp', 'greedy'],
        difficulty: '1400'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'K-Tree Path Sum',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'A $k$-tree is an infinite tree with root where each vertex has $k$ children. The edges going to children have weights $1, 2, \\dots, k$.\n\nFind the number of paths starting at root with total edge weight $n$ such that at least one edge on the path has weight $\\ge d$. Print answer modulo $10^9 + 7$.',
        inputFormat: 'Three integers $n, k, d$ ($1 \\le n, k \\le 100$, $1 \\le d \\le k$).',
        outputFormat: 'Print the answer modulo $10^9 + 7$.',
        sampleInput: '3 3 2\n',
        sampleOutput: '3\n',
        note: 'Paths of sum 3 using at least one edge $\\ge 2$: [1, 2], [2, 1], [3]. Total: 3.',
        hiddenTestCases: [
            { input: '3 3 3\n', output: '1\n' },
            { input: '4 5 2\n', output: '7\n' }
        ],
        tags: ['dp', 'trees'],
        difficulty: '1500'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Boredom Frequency Score',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Alex doesn\'t like boredom. He has an array $a$ of $n$ integers. He can make a move: choose an element $x$, delete all occurrences of $x$, and gain $x \\times \\text{count}(x)$ points. However, doing so also destroys all elements equal to $x - 1$ and $x + 1$.\n\nWhat is the maximum number of points Alex can score?',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). The second line contains $a_1, \\dots, a_n$ ($1 \\le a_i \\le 10^5$).',
        outputFormat: 'Print the single integer — the maximum points.',
        sampleInput: '2\n1 2\n',
        sampleOutput: '2\n',
        note: 'Pick 2 for 2 points, 1 is deleted.',
        hiddenTestCases: [
            { input: '9\n1 2 1 3 2 2 2 2 3\n', output: '10\n' },
            { input: '3\n1 2 3\n', output: '4\n' }
        ],
        tags: ['dp'],
        difficulty: '1500'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Registration System Hash Table',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'A new e-mail service "Berlandesk" wants to set up a registration system. When a new user requests a username, if it doesn\'t exist in the database, the system outputs `OK` and adds it. If it already exists, the system adds the smallest positive integer $k$ to the end of the name such that the new string has not been registered yet, outputs the new name, and records it.',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). Next $n$ lines contain username requests.',
        outputFormat: 'Print $n$ lines corresponding to the responses.',
        sampleInput: '4\nabacaba\nacaba\nabacaba\nacab\n',
        sampleOutput: 'OK\nOK\nabacaba1\nOK\n',
        note: 'The 3rd request "abacaba" collides with the first, so "abacaba1" is issued.',
        hiddenTestCases: [
            { input: '3\nuser\nuser\nuser\n', output: 'OK\nuser1\nuser2\n' },
            { input: '1\nalpha\n', output: 'OK\n' }
        ],
        tags: ['data structures', 'hash table'],
        difficulty: '1300'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Vacations Activity DP',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Vasya has $n$ days of vacation. On each day, the gym can be open or closed, and a contest can be running or not ($0$: neither, $1$: contest only, $2$: gym only, $3$: both).\n\nVasya never does the same activity (gym or contest) on two consecutive days. What is the minimum number of days Vasya has to rest?',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 100$). Second line contains $a_1, \\dots, a_n$ ($0 \\le a_i \\le 3$).',
        outputFormat: 'Print the minimum number of rest days.',
        sampleInput: '4\n1 3 2 0\n',
        sampleOutput: '2\n',
        note: 'Day 1: contest. Day 2: rest. Day 3: gym. Day 4: rest. Total rests = 2.',
        hiddenTestCases: [
            { input: '2\n0 0\n', output: '2\n' },
            { input: '3\n3 3 3\n', output: '0\n' }
        ],
        tags: ['dp'],
        difficulty: '1400'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Party Depth in Tree',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'A company has $n$ employees numbered $1$ to $n$. Each employee either has an immediate manager or is a top manager (denoted by $-1$). The management structure forms a collection of trees.\n\nYou want to split the employees into the minimum number of groups such that no group contains an employee and their direct or indirect manager. Find the minimum number of groups.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 2000$). Next $n$ lines contain $p_i$, the manager of employee $i$ (or $-1$).',
        outputFormat: 'Print the minimum number of groups.',
        sampleInput: '5\n-1\n1\n2\n1\n-1\n',
        sampleOutput: '3\n',
        note: 'Path $1 \\to 2 \\to 3$ has length 3, so at least 3 groups are required.',
        hiddenTestCases: [
            { input: '3\n-1\n-1\n-1\n', output: '1\n' },
            { input: '2\n-1\n1\n', output: '2\n' }
        ],
        tags: ['dfs', 'trees'],
        difficulty: '1300'
    },
    {
        track: 'shin',
        letter: 'C',
        points: 300,
        title: 'Cut Ribbon Dynamic Programming',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Polycarpus has a ribbon, its length is $n$. He wants to cut the ribbon in a way that fulfils the following two conditions:\n1. After cutting each piece has length equal to $a, b$, or $c$.\n2. The number of ribbon pieces obtained is maximized.\n\nFind the maximum number of ribbon pieces.',
        inputFormat: 'The single line contains four space-separated integers $n, a, b, c$ ($1 \\le n, a, b, c \\le 4000$).',
        outputFormat: 'Print the maximum number of pieces.',
        sampleInput: '5 5 3 2\n',
        sampleOutput: '2\n',
        note: 'Cuts of lengths 2 and 3 sum to 5 (2 pieces).',
        hiddenTestCases: [
            { input: '7 5 5 2\n', output: '2\n' },
            { input: '10 2 3 5\n', output: '5\n' }
        ],
        tags: ['dp'],
        difficulty: '1300'
    },

    // --- Category D (400 Points) ---
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Ceil the Commander Tree Centroid',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'General Fox has an army organized in a tree of $n$ vertices. You need to assign each vertex a rank from \'A\' to \'Z\' such that between any two vertices with the same rank, there exists at least one vertex on the simple path between them with a strictly higher rank (lexicographically smaller).\n\nIf possible, output the assignment. Otherwise output `Impossible!`.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 10^5$). Next $n-1$ lines contain the edges of the tree.',
        outputFormat: 'Print $n$ space-separated characters denoting the assigned rank for each vertex, or `Impossible!`.',
        sampleInput: '3\n1 2\n2 3\n',
        sampleOutput: 'B A B\n',
        note: 'Vertex 2 has rank A, vertices 1 and 3 have rank B. Path between 1 and 3 passes through 2 (rank A > B).',
        hiddenTestCases: [
            { input: '1\n', output: 'A\n' },
            { input: '4\n1 2\n2 3\n3 4\n', output: 'B A C B\n' }
        ],
        tags: ['divide and conquer', 'trees'],
        difficulty: '1900'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Valid BFS Check',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'The BFS algorithm traverses a graph level by level. Given an undirected graph of $n$ vertices and $m$ edges, and a permutation of vertices $a_1, a_2, \\dots, a_n$, determine whether $a$ could be the traversal order of a standard BFS starting at vertex $1$.',
        inputFormat: 'First line contains $n, m$ ($1 \\le n, m \\le 2 \\times 10^5$). Next $m$ lines contain graph edges. The last line contains the permutation $a$.',
        outputFormat: 'Print `Yes` if the permutation is a valid BFS order, and `No` otherwise.',
        sampleInput: '4 3\n1 2\n1 3\n2 4\n1 2 3 4\n',
        sampleOutput: 'Yes\n',
        note: 'BFS from 1 can visit 2 then 3, then from 2 visit 4. Valid.',
        hiddenTestCases: [
            { input: '4 3\n1 2\n1 3\n2 4\n1 4 2 3\n', output: 'No\n' }
        ],
        tags: ['bfs', 'graphs', 'shortest paths'],
        difficulty: '1700'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Segment Tree Range GCD Query',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You are given an array $a$ of $n$ integers. You need to answer $q$ queries. In each query $(l, r)$, find the greatest common divisor $\\gcd(a_l, a_{l+1}, \\dots, a_r)$.',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). The second line contains $a_1, \\dots, a_n$ ($1 \\le a_i \\le 10^9$). The third line contains $q$ ($1 \\le q \\le 10^5$). Next $q$ lines contain $l, r$ ($1 \\le l \\le r \\le n$).',
        outputFormat: 'For each query, output the GCD.',
        sampleInput: '4\n12 18 24 6\n2\n1 2\n2 4\n',
        sampleOutput: '6\n6\n',
        note: '$\\gcd(12, 18) = 6$, $\\gcd(18, 24, 6) = 6$.',
        hiddenTestCases: [
            { input: '3\n7 14 21\n1\n1 3\n', output: '7\n' }
        ],
        tags: ['segment tree', 'math'],
        difficulty: '1700'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Coloring Trees Dynamic Programming',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'There are $n$ trees in a row. Tree $i$ currently has color $c_i$ ($0$ if uncolored). Coloring tree $i$ with color $j$ ($1 \\le j \\le m$) costs $p_{i, j}$ units of paint.\n\nA beauty of the trees is defined as the number of contiguous color segments (blocks of adjacent identical colors). What is the minimum cost to color all uncolored trees so that the total beauty is exactly $k$?',
        inputFormat: 'First line contains $n, m, k$ ($1 \\le k \\le n \\le 100, 1 \\le m \\le 100$). Second line contains initial colors $c_i$. Next $n$ lines contain costs matrix $p_{i, j}$.',
        outputFormat: 'Print the minimum cost, or `-1` if impossible.',
        sampleInput: '3 2 2\n0 0 0\n1 2\n3 4\n5 6\n',
        sampleOutput: '10\n',
        note: 'Colors [1, 1, 2] has 2 groups: cost $1 + 3 + 6 = 10$.',
        hiddenTestCases: [
            { input: '2 2 1\n1 2\n1 1\n1 1\n', output: '-1\n' }
        ],
        tags: ['dp'],
        difficulty: '1800'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Longest Path in DAG',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You are given a directed acyclic graph (DAG) with $n$ vertices and $m$ edges. Find the length of the longest directed path in the graph.',
        inputFormat: 'First line contains $n, m$ ($1 \\le n \\le 10^5, 0 \\le m \\le 10^5$). Next $m$ lines contain directed edges $u, v$.',
        outputFormat: 'Print the length of the longest path (number of edges).',
        sampleInput: '4 5\n1 2\n1 3\n3 2\n2 4\n3 4\n',
        sampleOutput: '3\n',
        note: 'Path $1 \\to 3 \\to 2 \\to 4$ contains 3 edges.',
        hiddenTestCases: [
            { input: '2 0\n', output: '0\n' },
            { input: '3 2\n1 2\n2 3\n', output: '2\n' }
        ],
        tags: ['dag', 'topological sort', 'dp'],
        difficulty: '1600'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Prefix-Free Binary Strings',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'A set of binary strings is called prefix-free if no string is a prefix of any other string in the set. You are given the lengths $l_1, l_2, \\dots, l_n$ of $n$ binary strings you need to construct. Determine whether a prefix-free code with these lengths exists (Kraft\'s inequality: $\\sum 2^{-l_i} \\le 1$), and output the strings.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 1000$). Second line contains $l_1, \\dots, l_n$ ($1 \\le l_i \\le 1000$).',
        outputFormat: 'If impossible, print `NO`. Otherwise print `YES` and $n$ binary strings.',
        sampleInput: '3\n1 2 2\n',
        sampleOutput: 'YES\n0\n10\n11\n',
        note: 'None of {0, 10, 11} is a prefix of another.',
        hiddenTestCases: [
            { input: '2\n1 1\n', output: 'YES\n0\n1\n' },
            { input: '3\n1 1 1\n', output: 'NO\n' }
        ],
        tags: ['trie', 'greedy', 'strings'],
        difficulty: '1800'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Tree Diameter Centroid Query',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'Given an unweighted tree of $n$ vertices, calculate the diameter of the tree (the maximum distance between any pair of vertices).',
        inputFormat: 'The first line contains $n$ ($1 \\le n \\le 10^5$). The next $n-1$ lines contain edges of the tree.',
        outputFormat: 'Print the diameter of the tree.',
        sampleInput: '4\n1 2\n2 3\n2 4\n',
        sampleOutput: '2\n',
        note: 'Distance between 3 and 4 is 2.',
        hiddenTestCases: [
            { input: '2\n1 2\n', output: '1\n' },
            { input: '5\n1 2\n2 3\n3 4\n4 5\n', output: '4\n' }
        ],
        tags: ['trees', 'dfs'],
        difficulty: '1600'
    },
    {
        track: 'shin',
        letter: 'D',
        points: 400,
        title: 'Array GCD Transformation',
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: 'You are given an array $a$ of $n$ integers. In one operation you can choose an index $i$ and increase or decrease $a_i$ by $1$. Find the minimum number of operations required so that $\\gcd(a_1, a_2, \\dots, a_n) > 1$.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 10^5$). Second line contains $a_1, \\dots, a_n$ ($1 \\le a_i \\le 10^9$).',
        outputFormat: 'Print the minimum operations.',
        sampleInput: '3\n2 3 5\n',
        sampleOutput: '2\n',
        note: 'Change 3 to 2, 5 to 4 or 6. Total operations = 2, all even (GCD = 2).',
        hiddenTestCases: [
            { input: '2\n4 6\n', output: '0\n' },
            { input: '1\n1\n', output: '1\n' }
        ],
        tags: ['number theory', 'randomization'],
        difficulty: '1800'
    },

    // --- Category E (500 Points) ---
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Little Elephant and Tree Inversions',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'The Little Elephant loves trees. You are given a tree with $n$ vertices. Each vertex has a weight $w_i$. Count the number of pairs $(u, v)$ such that $u$ is an ancestor of $v$ and $w_u > w_v$.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 10^5$). Second line contains weights $w_1, \\dots, w_n$. Next $n-1$ lines contain tree edges.',
        outputFormat: 'Print the number of inversion pairs.',
        sampleInput: '3\n3 2 1\n1 2\n2 3\n',
        sampleOutput: '3\n',
        note: 'Pairs: (1, 2) since 3 > 2; (1, 3) since 3 > 1; (2, 3) since 2 > 1. Total: 3.',
        hiddenTestCases: [
            { input: '2\n1 2\n1 2\n', output: '0\n' }
        ],
        tags: ['fenwick tree', 'dsu on tree'],
        difficulty: '2100'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Lazy Propagation Range Affine Transformation',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'You are given an array $a$ of $n$ elements. You must process $q$ queries of three types:\n1. For all $i \\in [l, r]$, $a_i \\leftarrow (a_i \\times v + c) \\pmod{998244353}$.\n2. For all $i \\in [l, r]$, $a_i \\leftarrow (a_i + c) \\pmod{998244353}$.\n3. Calculate $\\left(\\sum_{i=l}^r a_i\\right) \\pmod{998244353}$.',
        inputFormat: 'First line contains $n, q$ ($1 \\le n, q \\le 10^5$). Second line contains array $a$. Next $q$ lines contain queries.',
        outputFormat: 'For each type 3 query, print the sum modulo $998244353$.',
        sampleInput: '5 3\n1 2 3 4 5\n1 1 5 2 1\n3 1 5\n3 2 4\n',
        sampleOutput: '35\n21\n',
        note: 'Elements become $1 \\times 2 + 1 = 3, 5, 7, 9, 11$. Sum = 35.',
        hiddenTestCases: [
            { input: '2 1\n10 20\n3 1 2\n', output: '30\n' }
        ],
        tags: ['segment tree', 'lazy propagation', 'math'],
        difficulty: '2200'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Max Flow Dinic Min Cut',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'Given a directed graph with capacities on edges, find the maximum flow from source $s=1$ to sink $t=n$.',
        inputFormat: 'First line contains $n, m$ ($2 \\le n \\le 500, 1 \\le m \\le 5000$). Next $m$ lines contain $u, v, c$.',
        outputFormat: 'Print the maximum flow value.',
        sampleInput: '4 5\n1 2 3\n1 3 2\n2 3 1\n2 4 2\n3 4 3\n',
        sampleOutput: '5\n',
        note: 'Max flow from 1 to 4 is 5.',
        hiddenTestCases: [
            { input: '2 1\n1 2 10\n', output: '10\n' }
        ],
        tags: ['flows', 'graphs'],
        difficulty: '2100'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Convex Hull Trick Optimization',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'There are $n$ trees to cut down. Cutting down tree $i$ has cost $a_i + b_i \\times x$. Using Dynamic Programming with Convex Hull Trick, find the minimum total cost to complete the sequence of operations.',
        inputFormat: 'First line contains $n$ ($1 \\le n \\le 10^5$). Next lines contain array $a$ and $b$.',
        outputFormat: 'Print the minimum cost.',
        sampleInput: '3\n1 2 3\n3 2 1\n',
        sampleOutput: '6\n',
        note: 'Optimal ordering yields 6.',
        hiddenTestCases: [
            { input: '1\n5\n0\n', output: '5\n' }
        ],
        tags: ['geometry', 'dp', 'convex hull trick'],
        difficulty: '2300'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Bitmask DP Hamiltonian TSP',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'You have $n$ cities and the travel cost between every pair of cities is given. Find the minimum cost to visit every city exactly once and return to the starting city $0$.',
        inputFormat: 'First line contains $n$ ($2 \\le n \\le 16$). Next $n$ lines contain matrix $C_{i, j}$ ($0 \\le C_{i, j} \\le 10^4$).',
        outputFormat: 'Print the minimum tour cost.',
        sampleInput: '3\n0 10 20\n10 0 15\n20 15 0\n',
        sampleOutput: '45\n',
        note: 'Tour $0 \\to 1 \\to 2 \\to 0$ cost: $10 + 15 + 20 = 45$.',
        hiddenTestCases: [
            { input: '2\n0 5\n5 0\n', output: '10\n' }
        ],
        tags: ['bitmasks', 'dp'],
        difficulty: '2000'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Centroid Decomposition Path Query',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'Given a tree with $n$ vertices and weights on edges, count the number of simple paths between pairs of vertices with total path length exactly equal to $k$.',
        inputFormat: 'First line contains $n, k$ ($1 \\le n \\le 5 \\times 10^4, 1 \\le k \\le 500$). Next $n-1$ lines contain $u, v, w$.',
        outputFormat: 'Print the number of paths.',
        sampleInput: '4 2\n1 2 1\n2 3 1\n2 4 1\n',
        sampleOutput: '3\n',
        note: 'Paths of length 2: (1, 3), (1, 4), (3, 4). Total: 3.',
        hiddenTestCases: [
            { input: '2 1\n1 2 1\n', output: '1\n' }
        ],
        tags: ['divide and conquer', 'trees'],
        difficulty: '2200'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Number Theoretic Transform Polynomial Multiplication',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'Given two polynomials $A(x) = \\sum_{i=0}^{n-1} a_i x^i$ and $B(x) = \\sum_{i=0}^{m-1} b_i x^i$, compute their product $C(x) = A(x) \\cdot B(x)$ modulo $998244353$.',
        inputFormat: 'First line contains $n, m$ ($1 \\le n, m \\le 10^5$). Second line contains $a_0, \\dots, a_{n-1}$. Third line contains $b_0, \\dots, b_{m-1}$.',
        outputFormat: 'Print the coefficients of $C(x)$ separated by spaces.',
        sampleInput: '2 2\n1 2\n3 4\n',
        sampleOutput: '3 10 8\n',
        note: '$(1 + 2x)(3 + 4x) = 3 + 10x + 8x^2$.',
        hiddenTestCases: [
            { input: '1 1\n5\n7\n', output: '35\n' }
        ],
        tags: ['fft', 'math'],
        difficulty: '2200'
    },
    {
        track: 'shin',
        letter: 'E',
        points: 500,
        title: 'Tree Heavy-Light Decomposition Subtree Query',
        timeLimit: 2.0,
        memoryLimit: 512,
        statementHtml: 'You are given a tree of $n$ vertices with initial values. Process queries: 1) update the value of all vertices on the path between $u$ and $v$ by $+x$; 2) query the maximum value in the subtree of vertex $u$.',
        inputFormat: 'First line contains $n, q$ ($1 \\le n, q \\le 10^5$). Next lines describe tree and queries.',
        outputFormat: 'Output answer for each type 2 query.',
        sampleInput: '3 2\n1 2\n2 3\n1 1 3 5\n2 1\n',
        sampleOutput: '5\n',
        note: 'Path updated with +5. Subtree max of 1 is 5.',
        hiddenTestCases: [
            { input: '1 1\n2 1\n', output: '0\n' }
        ],
        tags: ['hld', 'segment tree', 'trees'],
        difficulty: '2300'
    }
];

const { INITIAL_FORMA_QUESTIONS } = require('./seedFormaQuestions');

/**
 * Seeds the Question Bank with 8 questions per category A-E for both Shin and Forma.
 */
async function seedQuestionBankIfNeeded() {
    try {
        const shinCount = await KataQuestionBankModel.countDocuments({ track: 'shin' });
        const formaCount = await KataQuestionBankModel.countDocuments({ track: 'forma' });

        if (shinCount >= 40 && formaCount >= 40) {
            console.log(`[KataSeed] Question bank complete with ${shinCount} Shin and ${formaCount} Forma questions.`);
            return;
        }

        console.log(`[KataSeed] Seeding/verifying question bank (Shin: ${shinCount}/40, Forma: ${formaCount}/40)...`);
        
        // 1. Seed Shin C++ questions
        for (const q of INITIAL_SHIN_QUESTIONS) {
            const exists = await KataQuestionBankModel.findOne({ title: q.title, track: 'shin' });
            if (!exists) {
                await KataQuestionBankModel.create({ ...q, track: 'shin' });
            }
        }

        // 2. Seed Forma HTML/CSS/JS questions
        for (const q of INITIAL_FORMA_QUESTIONS) {
            const exists = await KataQuestionBankModel.findOne({ title: q.title, track: 'forma' });
            if (!exists) {
                await KataQuestionBankModel.create(q);
            }
        }

        const total = await KataQuestionBankModel.countDocuments();
        console.log(`[KataSeed] Question bank fully verified and seeded. Total: ${total} questions.`);
    } catch (err) {
        console.error('[KataSeed] Failed to seed question bank:', err);
    }
}

module.exports = {
    seedQuestionBankIfNeeded,
    INITIAL_SHIN_QUESTIONS,
    INITIAL_FORMA_QUESTIONS
};
