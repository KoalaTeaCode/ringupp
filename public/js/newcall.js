import { randomThreeWords } from './sentencer/sentencer.js'


// const randomName = Sentencer.make("{{ noun }}-{{ an_adjective }}-{{ noun }}");
const randomName = randomThreeWords()
document.getElementById('callname').value = randomName
