function decodeXml(value = '') {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(xml = '') {
  return decodeXml(xml.replace(/<[^>]+>/g, ''));
}

function attr(xml = '', name) {
  const pattern = new RegExp(`${name}="([^"]*)"`);
  const match = xml.match(pattern);
  return match ? match[1] : '';
}

module.exports = {
  attr,
  decodeXml,
  stripTags
};
