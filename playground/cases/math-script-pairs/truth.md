# Paired and nested scripts

- **Stresses:** a raised and a lowered script on one base: stacked tensor indices, stacked asymmetric bounds, an atom count followed by a charge, a script on a script, a TeX italic-correction gap before a script; an ordinal, a superscript citation and a spaced footnote marker beside them
- **Families:** math
- **Status:** ok
- **Showcase:** a base and its two scripts are three separate runs on three baselines; read in content order the charge of PO₄³⁻ joins the atom count, a stacked lower bound falls to the next line, and a script of a script reads as a second index

Section **2 Notation** of a methods paper. In LaTeX notation the section reads:

> The Christoffel symbols $\Gamma^k_{ij}$ are symmetric in their lower indices $i$ and $j$; the
> curvature tensor $R^i_{jkl}$ is built from them.
>
> The measured mass ratio is $q = 0.112^{+0.008}_{-0.009}$, the same in the 2nd run as in the first.
>
> The functional $F^m$ evolves as $F^m_t = 2\int |R_{ij} + \nabla_i\nabla_j f|^2\,dm$, as shown before.$^{12}$
>
> The step size $\eta_{t_0}$ is reset at the restart time $t_0 = 400$ of each cycle.
>
> The buffer holds phosphate ($\mathrm{PO}_4^{3−}$), ammonium ($\mathrm{NH}_4^{+}$) and sulfate ($\mathrm{SO}_4^{2−}$) on each GPU $^{3}$.

Footnote 3: Both runs used the same random seed.

Every script has to stay attached to its base and distinguishable as raised or lowered: the
charge of PO₄³⁻ must not read as part of the atom count, the lower bound of $q$ must
stay beside the upper one, and $t_0$ must read as the script of $\eta$'s script, not as a second
index. Any unambiguous notation is fine.

## Questions an agent should be able to answer

1. Which indices of the Christoffel symbol are lower, and which is upper? — lower $i$ and $j$, upper $k$
2. What is the measured mass ratio, with its uncertainties? — 0.112 +0.008/−0.009
3. How many oxygen atoms does the phosphate ion have, and what is its charge? — 4 oxygen atoms, charge 3−
4. What is the time derivative of $F^m$ equal to? — $2\int |R_{ij} + \nabla_i\nabla_j f|^2\,dm$
5. At what time is the step size evaluated, and what is that time? — at the restart time $t_0$, 400

All five are answered from `read.md` (#241): `Γ^k_{ij}` and `R^i_{jkl}` keep both scripts on
their base, `q = 0.112^{+0.008}_{−0.009}` keeps its lower bound on the line,
`PO_4^{3−}`, `NH_4^+` and `SO_4^{2−}` keep the count and the charge apart, `F^m_t` reads through the
italic correction, and `η_{t_0}` nests `t_0` inside the subscript. The ordinal reads `2^{nd}`, the
citation `before.^12`, and the footnote marker, set after a word space, stays apart from the
word (`GPU ^3`) rather than joining it.
