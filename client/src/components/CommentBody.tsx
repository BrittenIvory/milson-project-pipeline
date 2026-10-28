import { Fragment } from 'react';
import clsx from 'clsx';

const TOKEN_SPLIT = /(https?:\/\/[^\s<>"']+|@[\w.-]+(?: [A-Za-z-]+)?)/g;
const URL_MATCH = /^https?:\/\//;
// Sentence punctuation at the end of a pasted URL ("see https://x.com.") is not
// part of the address — strip it back out of the link text.
const TRAILING_PUNCT = /[.,;:!?'"()[\]{}]+$/;

/** Strips sentence punctuation glued to a pasted URL, keeping balanced
 *  trailing closers (e.g. `Foo_(bar)` in wiki links) and real `?`/`!`
 *  inside the URL (e.g. `?q=urgent!` keeps its bang). */
function splitUrlTrailing(url: string): [string, string] {
  let href = url;
  while (TRAILING_PUNCT.test(href)) {
    const last = href.slice(-1);
    if (')]}'.includes(last)) {
      const open = last === ')' ? '(' : last === ']' ? '[' : '{';
      if (href.split(last).length <= href.split(open).length) break;
    } else if (last === '?' || last === '!') {
      // A ?/! after other ?/! characters belongs to the URL (query syntax);
      // only a lone trailing one reads as sentence punctuation.
      if (href.slice(0, -1).includes('?') || href.slice(0, -1).includes('!')) break;
    }
    href = href.slice(0, -1);
  }
  return [href, url.slice(href.length)];
}

/**
 * Comment text with @mentions highlighted and http(s) links clickable
 * (opened in a new tab).
 */
export default function CommentBody({ body, className }: { body: string; className?: string }) {
  const parts = body.split(TOKEN_SPLIT);
  return (
    <p className={clsx('whitespace-pre-line break-words text-sm text-slate-700', className)}>
      {parts.map((part, index) => {
        if (URL_MATCH.test(part)) {
          const [href, tail] = splitUrlTrailing(part);
          return (
            <Fragment key={index}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
              >
                {href}
              </a>
              {tail}
            </Fragment>
          );
        }
        return part.startsWith('@') ? (
          <span key={index} className="font-medium text-brand-700">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        );
      })}
    </p>
  );
}
