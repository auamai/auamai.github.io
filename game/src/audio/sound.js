// Bridge from game events to the WebAudio engine (audio.js).
// Installed onto Game.prototype by game.js (methods use `this`, the Game).


export class Sound {
  sfx(name, x = 0, lvl = 0) { this.audio?.sfx(name, x / 4, lvl); }
}
