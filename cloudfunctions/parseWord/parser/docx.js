const JSZip = require('jszip');
const { attr, decodeXml, stripTags } = require('./xml');

async function parseDocxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  const relsXml = zip.file('word/_rels/document.xml.rels')
    ? await zip.file('word/_rels/document.xml.rels').async('string')
    : '';
  const relationships = parseRelationships(relsXml);

  return {
    paragraphs: parseParagraphs(documentXml, relationships),
    relationships
  };
}

function parseRelationships(xml) {
  const relationships = {};
  const matches = xml.match(/<Relationship\b[^>]*\/>/g) || [];
  matches.forEach((item) => {
    const id = attr(item, 'Id');
    const target = attr(item, 'Target');
    if (id) relationships[id] = target;
  });
  return relationships;
}

function parseParagraphs(documentXml, relationships = {}) {
  const paragraphXmls = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];

  return paragraphXmls.map((paragraphXml, index) => {
    const runs = parseRuns(paragraphXml, relationships);
    const text = runs.map((run) => run.text).join('');
    const images = runs.flatMap((run) => run.images);

    return {
      index: index + 1,
      text: normalizeText(text),
      runs,
      images
    };
  });
}

function parseRuns(paragraphXml, relationships = {}) {
  const runXmls = paragraphXml.match(/<w:r[\s\S]*?<\/w:r>/g) || [];

  return runXmls.map((runXml) => {
    const textParts = [];
    const textMatches = runXml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [];
    textMatches.forEach((textXml) => {
      textParts.push(stripTags(textXml));
    });

    const tabCount = (runXml.match(/<w:tab\/>/g) || []).length;
    for (let i = 0; i < tabCount; i += 1) textParts.push('\t');

    const brCount = (runXml.match(/<w:br\/>/g) || []).length;
    for (let i = 0; i < brCount; i += 1) textParts.push('\n');

    const colorMatch = runXml.match(/<w:color\b[^>]*w:val="([^"]+)"/);
    const underline = /<w:u\b/.test(runXml);
    const bold = /<w:b\b/.test(runXml);
    const images = extractImages(runXml, relationships);

    return {
      text: decodeXml(textParts.join('')),
      color: colorMatch ? colorMatch[1].toUpperCase() : '',
      underline,
      bold,
      images
    };
  });
}

function extractImages(runXml, relationships = {}) {
  const ids = [];
  const embedMatches = runXml.match(/r:embed="([^"]+)"/g) || [];
  embedMatches.forEach((item) => {
    const id = item.replace(/^r:embed="/, '').replace(/"$/, '');
    ids.push(id);
  });

  return ids.map((id) => ({
    relationshipId: id,
    target: relationships[id] || ''
  }));
}

function normalizeText(value = '') {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

module.exports = {
  parseDocxBuffer,
  parseParagraphs,
  parseRelationships
};
