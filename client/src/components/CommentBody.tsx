import { Fragment } from 'react';
import clsx from 'clsx';

const TOKEN_SPLIT = /(https?:\/\/[^\s<>"']+|@[\w.-]+(?: [A-Za-z-]+)?)/g;
const URL_MATCH = /^https?:\/\//;

/**
 * Comment text with @mentions highlighted and http(s) links clickable
 * (opened in a new tab).
 */
export default function CommentBody({ body, className }: { body: string; className?: string }) {
  const parts = body.split(TOKEN_SPLIT);
  return (
    <p className={clsx('whitespace-pre-line break-words text-sm text-slate-700', className)}>
      {parts.map((part, index) =>
        URL_MATCH.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
          >
            {part}
          </a>
        ) : part.startsWith('@') ? (
          <span key={index} className="font-medium text-brand-700">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
