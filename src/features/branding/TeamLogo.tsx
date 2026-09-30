/** The team logo: always the official BVB crest (public/Borussia_Dortmund_logo.svg). Decorative — it sits next to the team name. */
export function TeamLogo({ size = 40 }: { size?: number }) {
  return <img className="bd-logo" src="/Borussia_Dortmund_logo.svg" width={size} height={size} alt="" />
}
