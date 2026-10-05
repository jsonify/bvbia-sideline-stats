// The words behind the ⓘ buttons. Everything a parent reads in the stat guide lives in this one file, in plain
// language, so it is easy to reword. Pictures are in Scene.tsx; each outcome below names the picture it uses.

export type TopicId = 'duel' | 'first_contact' | 'box_entry'

export type SceneId =
  | 'duel-won' | 'duel-lost'
  | 'through-clean' | 'through-miss'
  | 'long-clean' | 'long-miss'
  | 'box-shot' | 'box-noshot'

/** One button on the tracker (Won, Clean, Shot...) and when it is the right one to tap. Icons match the buttons. */
export interface Outcome {
  tone: 'good' | 'bad'
  icon: string
  label: string
  when: string
  scene: SceneId
}

export interface Section {
  /** Only when a topic has more than one kind of play, e.g. through ball and long ball. */
  heading?: string
  about?: string
  outcomes: Outcome[]
}

export interface Topic {
  id: TopicId
  /** Names the topic wherever it must fit in a few words: the tab and the ⓘ button label. */
  tab: string
  title: string
  lead: string
  why: string
  sections: Section[]
  words: { term: string; meaning: string }[]
  tip: string
}

export const TOPIC_IDS: readonly TopicId[] = ['duel', 'first_contact', 'box_entry']

export const TOPICS: Record<TopicId, Topic> = {
  duel: {
    id: 'duel',
    tab: '1v1s',
    title: 'Defensive 1v1s',
    lead: 'A 1v1 (say "one-on-one") is when a player on the other team has the ball and tries to dribble past one of our defenders. One attacker, one defender, face to face.',
    why: 'It shows how often our defenders can stop an attacker on their own, without needing a teammate to bail them out.',
    sections: [{
      outcomes: [
        { tone: 'good', icon: '✓', label: 'Won', scene: 'duel-won',
          when: 'Our defender stopped them. They won the ball, knocked it away, or kept the attacker from getting past.' },
        { tone: 'bad', icon: '✕', label: 'Lost', scene: 'duel-lost',
          when: 'The attacker got past our defender, or kept the ball and kept coming.' },
      ],
    }],
    words: [
      { term: 'Defender', meaning: 'A player whose main job is to protect our goal.' },
      { term: 'Attacker', meaning: 'The player with the ball who is trying to get past. In a defensive 1v1, that is someone on the other team.' },
    ],
    tip: 'Tap when the 1v1 is over, not while it is still going on. Did not see how it ended? Skip it. One missed tap will not change the big picture.',
  },

  first_contact: {
    id: 'first_contact',
    tab: 'First contact',
    title: 'First contact',
    lead: 'When the other team sends the ball toward our goal, one of our players has to meet it. "First contact" is that first touch: did our player take charge of the ball, or did it get away from them? We also note the kind of ball: a through ball or a long ball.',
    why: 'It shows which kind of ball gives our defenders the most trouble, so the coach knows what to practice.',
    sections: [
      {
        heading: 'Through ball',
        about: 'A pass rolled along the ground into the open space behind or between our defenders, for an attacker to run onto.',
        outcomes: [
          { tone: 'good', icon: '✓', label: 'Clean', scene: 'through-clean',
            when: 'Our player gets to the ball first and clears it away or gets it under control.' },
          { tone: 'bad', icon: '✕', label: 'Miss', scene: 'through-miss',
            when: 'The ball gets past our player, or their touch is so poor that the other team ends up with it.' },
        ],
      },
      {
        heading: 'Long ball',
        about: 'A big kick sent a long way down the field, usually high in the air, instead of a short pass along the ground.',
        outcomes: [
          { tone: 'good', icon: '✓', label: 'Clean', scene: 'long-clean',
            when: 'Our player wins it in the air or settles it onto the ground, or heads or kicks it safely away.' },
          { tone: 'bad', icon: '✕', label: 'Miss', scene: 'long-miss',
            when: 'Our player swings and misses, mistimes the jump, or the ball bounces off them to the other team.' },
        ],
      },
    ],
    words: [
      { term: 'First touch', meaning: 'The very first time a player touches the ball after it arrives.' },
      { term: 'Clear', meaning: 'Kick or head the ball away from danger, usually far from our goal.' },
      { term: 'Under control', meaning: 'Stopped, with the ball at their feet instead of bouncing away.' },
    ],
    tip: 'Not sure which kind it was? Rolling along the ground into open space is a through ball. Flying high through the air is a long ball.',
  },

  box_entry: {
    id: 'box_entry',
    tab: 'Box entries',
    title: 'Box entries',
    lead: 'The "box" is the big rectangle painted on the grass in front of each goal. (Its proper name is the penalty area.) A box entry is each time our team gets the ball into the other team\'s box, by passing it in or dribbling it in.',
    why: 'The box is where goals come from. This shows how often our attacks turn into a real chance to score.',
    sections: [{
      outcomes: [
        { tone: 'good', icon: '◎', label: 'Shot', scene: 'box-shot',
          when: 'Our team took a shot at goal from that attack. It does not matter if it scored, got saved, or missed.' },
        { tone: 'bad', icon: '⊘', label: 'No shot', scene: 'box-noshot',
          when: 'The attack ended with no shot: the other team cleared it, took the ball, or it went out of play.' },
      ],
    }],
    words: [
      { term: 'Box', meaning: 'The penalty area: the big rectangle in front of the goal.' },
      { term: 'Shot', meaning: 'Any try at scoring, kicked or headed toward the goal. It does not have to be on target.' },
    ],
    tip: 'Tap once for each trip into the box, once you know whether a shot came from it.',
  },
}
