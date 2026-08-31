function escapeXml(unsafe) {
  if (typeof unsafe !== "string") {
    console.warn("escapeXml called with non-string value:", unsafe);
    return "";
  }
  return unsafe.replace(/[<>&"']/g, function (match) {
    switch (match) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return match;
    }
  });
}

export { escapeXml };
