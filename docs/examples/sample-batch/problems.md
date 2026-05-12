---
source: imo
year: 2024
problem_number: "1"
classes: [10, 11]
topics: [number-theory]
---

# Shart

Barcha musbat butun sonlar $n$ ni toping, shunday qilib $n+1$ son
$n^2 + 1$ ga qoldiqsiz bo'linsin.

# Yechim

Bo'linish $\frac{n^2 + 1}{n + 1}$ ni qoldiq bilan hisoblab,
$n^2 + 1 = (n + 1)(n - 1) + 2$ ekanini ko'ramiz. Demak $n + 1 \mid 2$,
ya'ni $n + 1 \in \{1, 2\}$. $n$ musbat butun son bo'lgani uchun yagona
yechim $n = 1$.

---

source: uzbekistan-national
year: 2023
problem_number: "P2"
classes: [9, 10]
topics: [algebra, inequalities]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib, $abc = 1$ shartni qanoatlantiradi.
Isbotlang:

$$a + b + c \geq 3$$

![Diagram](images/sample-fig1.png)

# Yechim

AM-GM tengsizligiga ko'ra, har qanday musbat $a, b, c$ uchun:

$$\frac{a + b + c}{3} \geq \sqrt[3]{abc}$$

$abc = 1$ shartdan $\sqrt[3]{abc} = 1$, demak $a + b + c \geq 3$.
Tenglik faqat $a = b = c = 1$ holida o'rinli.

---

source: imo-shortlist
year: 2022
problem_number: "C2"
classes: [10, 11]
topics: [combinatorics]
---

# Shart

$n \times n$ doskaning har bir katagiga $0$ yoki $1$ yoziladi. Doska
"yaxshi" deyiladi, agar har bir satr va har bir ustundagi sonlarning
yig'indisi juft son bo'lsa. $n \geq 1$ uchun yaxshi doskalar sonini
toping.

![Sample board](images/sample-fig2.png)
