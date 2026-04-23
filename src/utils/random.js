const adjectives = [
  'blue', 'swift', 'brave', 'cool', 'fast', 'happy', 'bright', 'calm', 'clever', 'kind',
  'silent', 'wild', 'smart', 'bold', 'dark', 'light', 'grand', 'epic', 'fancy', 'neat',
  'super', 'mega', 'ultra', 'royal', 'zen', 'frozen', 'flaming', 'golden', 'silver', 'icy',
  'magic', 'lucky', 'power', 'vivid', 'crisp', 'smooth', 'gentle', 'fierce', 'mighty', 'noble',
  'atomic', 'cosmic', 'solar', 'lunar', 'vocal', 'hidden', 'flying', 'steady', 'daring', 'ready'
];

const nouns = [
  'rabbit', 'tiger', 'eagle', 'wolf', 'panda', 'fox', 'lion', 'bear', 'hawk', 'shark',
  'pixel', 'cloud', 'storm', 'river', 'forest', 'ocean', 'mountain', 'star', 'moon', 'leaf',
  'bolt', 'fire', 'ice', 'wave', 'wind', 'shadow', 'spirit', 'ghost', 'dragon', 'knight',
  'pilot', 'scout', 'hunter', 'rider', 'seeker', 'finder', 'walker', 'runner', 'guard', 'warden',
  'core', 'base', 'node', 'link', 'zone', 'gate', 'path', 'road', 'trail', 'peak'
];

function generateHumanReadableId() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
  return `${adj}${noun}${num}`;
}

module.exports = { generateHumanReadableId };
