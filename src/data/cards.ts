export interface CardData {
  name: string;
  artist: string;
  image: string;
}

export const CARDS: CardData[] = [
  { name: 'Sage',      artist: 'David',    image: '/cards/Sage.png' },
  { name: 'Sun',       artist: 'Arjun',    image: '/cards/Sun.png' },
  { name: 'Moon',      artist: 'Erica',    image: '/cards/Moon.png' },
  { name: 'The Star',  artist: 'Philippe', image: '/cards/The Star.png' },
  { name: 'Comet',     artist: 'Manny',    image: '/cards/Comet.png' },
  { name: 'The Fates', artist: 'Arjun',    image: '/cards/The Fates.png' },
  { name: 'Throne',    artist: 'Erica',    image: '/cards/Throne.png' },
  { name: 'Key',       artist: 'David',    image: '/cards/Key.png' },
  { name: 'Knight',    artist: 'David',    image: '/cards/Knight.png' },
  { name: 'Gem',       artist: 'Manny',    image: '/cards/Gem.png' },
  { name: 'Talons',    artist: 'Matthew',  image: '/cards/Talons.png' },
  { name: 'The Void',  artist: 'Yang',     image: '/cards/The Void.png' },
  { name: 'Flames',    artist: 'Matthew',  image: '/cards/Flames.png' },
  { name: 'Skull',     artist: 'Kevin',    image: '/cards/Skull.png' },
  { name: 'Puzzle',    artist: 'Yang',     image: '/cards/Puzzle.png' },
  { name: 'Donjon',    artist: 'Arjun',    image: '/cards/Donjon.png' },
  { name: 'Ruin',      artist: 'Manny',    image: '/cards/Ruin.png' },
  { name: 'Euryale',   artist: 'Philippe', image: '/cards/Euryale.png' },
  { name: 'Rogue',     artist: 'Erica',    image: '/cards/Rogue.png' },
  { name: 'Balance',   artist: 'Evan',     image: '/cards/Balance.png' },
  { name: 'The Fool',  artist: 'Philippe', image: '/cards/The Fool.png' },
  { name: 'Jester',    artist: 'Erica',    image: '/cards/Jester.png' },
];

export const CARD_BACK_IMAGE = '/cards/Card Back.png';
