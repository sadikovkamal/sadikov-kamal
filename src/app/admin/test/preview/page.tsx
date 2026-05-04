"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/markdown-preview";

const SAMPLE = String.raw`# Test problem

Let $a, b, c$ be positive reals with $a + b + c = 3$. Prove that:

$$\sum_{cyc} \frac{a}{b+c} \geq \frac{3}{2}$$

## Solution

By the Cauchy-Schwarz inequality:

$$\left(\sum_{cyc} \frac{a}{b+c}\right) \left(\sum_{cyc} a(b+c)\right) \geq (a+b+c)^2$$

Aligned environment:

$$\begin{aligned}
(a+b)^2 &= a^2 + 2ab + b^2 \\
        &= a^2 + b^2 + 2ab
\end{aligned}$$

Cases:

$$f(x) = \begin{cases} 1 & \text{if } x > 0 \\ 0 & \text{otherwise} \end{cases}$$

Matrix:

$$A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$$

| Step | Reasoning |
|------|-----------|
| 1 | Apply Cauchy-Schwarz |
| 2 | Simplify the right side |
| 3 | Conclude |

` + "```python\ndef triangular(n):\n    return n * (n + 1) // 2\n```" + `

- Greek: $\alpha + \beta = \gamma$
- Sum: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$
- Task list:
  - [x] Done
  - [ ] Pending

![Diagram](https://placehold.co/400x200)
`;

export default function PreviewSandbox() {
  const [source, setSource] = useState(SAMPLE);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Markdown preview sandbox</h1>
        <p className="text-muted-foreground text-sm">
          Edit the source on the left; the rendered preview updates live.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Markdown source</h2>
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-h-[600px] font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Preview</h2>
          <div className="border rounded-md p-4 min-h-[600px]">
            <MarkdownPreview source={source} />
          </div>
        </div>
      </div>
    </div>
  );
}
