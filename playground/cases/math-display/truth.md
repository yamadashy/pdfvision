# Physics paper page with display equations

- **Stresses:** numbered display equations: fraction, integral and sum with limits, bracketed matrix, aligned multi-line derivation; stacked asymmetric uncertainties; inline Greek and scripts in prose
- **Families:** math
- **Status:** ok
- **Showcase:** display equations are runs on several baselines joined only by vector fraction bars, hanging operator glyphs and bracket strokes; read as lines they scatter across the page with their numbers among the page numbers

Page 7 of a preprint (running head “Standard-siren distances from low-redshift mergers”), section **III. DISTANCE ESTIMATION**.
In LaTeX notation, the page reads:

For a flat ΛCDM background the luminosity distance of a source at redshift $z$ is

$$d_L(z) = \frac{c\,(1+z)}{H_0} \int_0^{z} \frac{dz'}{E(z')} \qquad (1)$$

and the likelihood over the $N = 47$ events of the catalogue is

$$\ln \mathcal{L}(\theta) = -\frac{1}{2} \sum_{k=1}^{N} \frac{(d_k - \mu_k(\theta))^2}{\sigma_k^2} \qquad (2)$$

with $\theta = (H_0, \Omega_m)$. The marginal posterior covariance of $(H_0/100, \Omega_m)$ is

$$\Sigma = \begin{bmatrix} 0.042 & −0.013 \\ −0.013 & 0.027 \end{bmatrix} \qquad (3)$$

Expanding the expansion rate for $z \ll 1$:

$$\begin{aligned} E(z)^2 &= \Omega_m (1+z)^3 + \Omega_\Lambda \\ &= 0.31\,(1+z)^3 + 0.69 \\ &\approx 1 + 0.93\,z \end{aligned} \qquad (4)$$

Measured values, each a central value with stacked upper (+) and lower (−) uncertainties:
GW261103 lies at $d_L = 410^{+160}_{-180}$ Mpc
($z = 0.09^{+0.03}_{-0.04}$) with primary mass
$36^{+5}_{-4}\,M_\odot$, and the catalogue gives
$H_0 = 68.2^{+6.1}_{-4.7}$ km s⁻¹ Mpc⁻¹.

## Questions an agent should be able to answer

1. What is the luminosity distance of GW261103, with its uncertainties? — 410 +160/−180 Mpc (upper +160, lower −180)
2. What is the lowest primary mass consistent with the quoted interval? — 32 M⊙ (36 +5/−4 M⊙)
3. What is the covariance between H₀/100 and Ωm in Eq. (3)? — −0.013
4. Over what range does the sum in Eq. (2) run, and what is in its denominator? — k = 1 to N (N = 47); σ_k squared
5. What does Eq. (4) give for E(z)² at low redshift? — approximately 1 + 0.93 z (from 0.31(1+z)³ + 0.69)

Inline scripts are marked and stay on their line (#241). The stacked uncertainties read
`d_L = 410^+160_−180 Mpc (z = 0.09^{+0.03}_{−0.04})` (question 1), the mass `36^+5_−4 M⊙`
(question 2), and `H_0 = 68.2^{+6.1}_{−4.7} km s^−1 Mpc^−1`; inline symbols keep their subscripts
(`σ_k`, `θ = (H_0, Ω_m)`).

**Reads correctly (#241, display equations):** each display equation is read onto one line from its
geometry, with its number: Eq. (1) is `d_L(z) = (c (1 + z))/H_0 ∫_0^z dz′/E(z′), (1)` (fraction bars as
`/` with multi-term parts bracketed, the integral's limits as scripts), Eq. (2) is
`ln L(θ) = − 1/2 ∑_{k=1}^N ((d_k − μ_k(θ))^2)/σ^2_k, (2)` (question 4), the matrix is
`Σ = [[0.042, −0.013], [−0.013, 0.027]] . (3)` (question 3: −0.013), and the aligned derivation keeps its
rows with `(4)` on its middle row (question 5). The heading, page number and equations read in page
order: centred equations no longer form a column of their own. All five questions are answered from
`read.md`, and no warning fires.
