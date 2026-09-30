/** The team logo: always the BVB crest (public/bvb-crest.png). Decorative — it sits next to the team name. */
export function TeamLogo({ size = 40 }: { size?: number }) {
  return <img className="bd-logo" src="/bvb-crest.png" width={size} height={size} alt="" />
}
