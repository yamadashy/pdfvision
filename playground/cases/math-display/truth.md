# Physics paper page with display equations

- **Stresses:** numbered display equations: fraction, integral and sum with limits, bracketed matrix, aligned multi-line derivation; stacked asymmetric uncertainties; inline Greek and scripts in prose
- **Families:** math
- **Status:** known-gap (#241)

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

**Known gap (#241):** the page carries no warning at all, and every construct that leaves the
baseline is broken apart. The stacked uncertainties lose their lower half to a later line:
`lies at d = 410+160 Mpc (z = 0.09+0.03), with a primary mass of` followed, after a stray `L`,
by `−180` and `−0.04` on lines of their own — the survey's LIGO failure. Question 1 reads as
“410+160 Mpc” with an orphaned “−180” that could belong to either value. The mass survives as
`36+5−4 M⊙` because its scripts happen to sort onto one line (question 2 is answerable by
reading `+5−4` as a pair); `H = 68.2+6.1 km s−1 Mpc−1` loses `−4.7` and the subscript 0 to
later lines. Subscripts on inline symbols drift away: `standard deviations σ ,` then `k`, and
`with θ = (H , Ω )` then `0 m`.

The display equations are scattered across lines: Eq. (1) is
`c (1 + z)∫z dz′` / `dL(z) =` / `H` / `0` / `0 E(z′)`, interleaved with the section heading and
the page number `7`; Eq. (2) is `1 N (dk − μk(θ))2` / `ln L(θ) = − ∑` / `2 k` / `=1` / `σ2`,
so question 4 has to be reassembled from fragments. The matrix (question 3) and the aligned
derivation (question 5) come out row by row and are answerable: `0.042 −0.013` / `−0.013` /
`0.027` and `≈ 1 + 0.93 z.`.
