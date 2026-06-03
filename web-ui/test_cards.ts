import { readFileSync } from 'fs';

const fileContent = readFileSync('./app/pages/knowledge.vue', 'utf8');
const lines = fileContent.split(/\r?\n/);

console.log('Total lines in knowledge.vue:', lines.length);

const keywords = ['audio', 'umg', 'slate', '音频', '界面', 'interaction'];

console.log('Matching lines:');
lines.forEach((line, index) => {
  const lineNum = index + 1;
  const lineLower = line.toLowerCase();
  
  const matched = keywords.some(k => lineLower.includes(k));
  if (matched) {
    console.log(`${lineNum.toString().padStart(4, ' ')}: ${line.trim()}`);
  }
});
