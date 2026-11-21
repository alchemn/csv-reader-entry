// A fast CSV reader that returns exactly what csv-reader 1.0.0 returns for
// every input: {columns, rows, errors} for {text, header}, following the
// same broken-row policy. Written from the policy alone, in my own code.
//
// Speed idea: never walk the text one character at a time. An unquoted
// field is read by jumping to the next comma, line feed or carriage return
// with indexOf and slicing the whole run at once; a quoted field jumps
// from one quote, carriage return or line feed to the next the same way.
// The only per-character work left is deciding what each jump landed on.

// How a field ended: at a comma, at a line break, or at the end of text.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** The answer csv-reader 1.0.0 gives for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a U+FEFF at the start is dropped
  let line = 1;

  // The record being read: the line it starts on and its index in rows (null for the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and how many characters
  // the unquoted scan kept. Shared out-parameters, so reading a field
  // allocates nothing.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // The next LF / CR at or after pos, cached: -2 unknown, -1 none, else the
  // index. The cache stays true while pos only moves forward; the
  // unterminated-quote reset moves pos back, so it clears both.
  let lfPos = -2;
  let crPos = -2;
  function nextLf() {
    if (lfPos === -2 || (lfPos !== -1 && lfPos < pos)) lfPos = text.indexOf('\n', pos);
    return lfPos;
  }
  function nextCr() {
    if (crPos === -2 || (crPos !== -1 && crPos < pos)) crPos = text.indexOf('\r', pos);
    return crPos;
  }

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, beginning with `init`, up to the
  // next comma or line break. A CR not followed by LF is dropped (stray_cr).
  // Sets fValue, fEnded, and fAdded (the characters kept here).
  function readUnquoted(init) {
    fValue = init;
    fAdded = 0;
    for (;;) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fEnded = LINE_BREAK;
          return;
        }
        error('stray_cr');
        pos += 1;
        continue;
      }
      if (pos >= n) {
        fEnded = END;
        return;
      }
      const comma = text.indexOf(',', pos);
      const lf = nextLf();
      const cr = nextCr();
      let end = n;
      let kind = END;
      if (comma !== -1) {
        end = comma;
        kind = COMMA;
      }
      if (lf !== -1 && lf < end) {
        end = lf;
        kind = LINE_BREAK;
      }
      if (cr !== -1 && cr < end) {
        end = cr;
        kind = 3; // a CR: CRLF ends the line, a lone one is dropped
      }
      fValue += text.slice(pos, end);
      fAdded += end - pos;
      if (kind === END) {
        pos = n;
        fEnded = END;
        return;
      }
      if (kind === COMMA) {
        pos = end + 1;
        fEnded = COMMA;
        return;
      }
      if (kind === LINE_BREAK) {
        pos = end + 1;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      // A CR: followed by LF it ends the line, otherwise it is dropped.
      if (end + 1 < n && text.charCodeAt(end + 1) === 10) {
        pos = end + 2;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      error('stray_cr');
      pos = end + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    fValue = '';
    pos += 1;
    for (;;) {
      const quote = text.indexOf('"', pos);
      const lf = nextLf();
      const cr = nextCr();
      let end = n;
      let kind = END;
      if (quote !== -1) {
        end = quote;
        kind = 0; // a quote
      }
      if (cr !== -1 && cr < end) {
        end = cr;
        kind = 3; // a CR inside quotes reads as LF
      }
      if (lf !== -1 && lf < end) {
        end = lf;
        kind = 1; // an LF inside quotes
      }
      if (end > pos) fValue += text.slice(pos, end);
      if (kind === END) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        lfPos = -2;
        crPos = -2;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (kind === 0) {
        if (end + 1 < n && text.charCodeAt(end + 1) === 34) {
          fValue += '"'; // a doubled quote is one quote
          pos = end + 2;
          continue;
        }
        // The closing quote.
        pos = end + 1;
        if (pos >= n) {
          fEnded = END;
          return;
        }
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          fEnded = COMMA;
          return;
        }
        if (c === 10) {
          pos += 1;
          line += 1;
          fEnded = LINE_BREAK;
          return;
        }
        if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fEnded = LINE_BREAK;
          return;
        }
        // What follows the closing quote is appended as it stands, up to
        // the next comma or line break.
        readUnquoted(fValue);
        if (fAdded > 0) error('quote_junk');
        return;
      }
      if (kind === 3) {
        fValue += '\n';
        line += 1;
        pos = end + (end + 1 < n && text.charCodeAt(end + 1) === 10 ? 2 : 1);
        continue;
      }
      fValue += '\n';
      line += 1;
      pos = end + 1;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
      ended = fEnded;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
