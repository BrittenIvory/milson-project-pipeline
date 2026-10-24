import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchMentions } from './noteService';

const users = [
  { id: 1, fullName: 'Milson Administrator', email: 'Britten.Ivory@milsonfoundry.com' },
  { id: 2, fullName: 'Test User', email: 'test.user@milsonfoundry.com' },
  { id: 3, fullName: 'Devin Verify', email: 'devin.verify@milsonfoundry.com' },
  { id: 4, fullName: 'Anne-Marie Doe', email: 'amdoe@example.com' },
  { id: 5, fullName: 'Kelly Sales', email: 'brittensales@example.com' },
];

describe('matchMentions', () => {
  it('resolves a full name mention', () => {
    const hits = matchMentions('hey @Devin Verify check this', users);
    assert.deepEqual(hits.map((h) => h.id), [3]);
  });

  it('resolves dotted and email-local forms', () => {
    assert.deepEqual(matchMentions('cc @devin.verify', users).map((h) => h.id), [3]);
    assert.deepEqual(matchMentions('cc @test.user', users).map((h) => h.id), [2]);
  });

  it('resolves a first-name mention', () => {
    assert.deepEqual(matchMentions('ping @Test', users).map((h) => h.id), [2]);
  });

  it('resolves the email local-part first token when the display name differs', () => {
    // "@Britten" matches Britten.Ivory@ via the email local part, not the
    // display name "Milson Administrator".
    assert.deepEqual(matchMentions('ping @Britten', users).map((h) => h.id), [1]);
    assert.deepEqual(matchMentions('ping @Britten Ivory', users).map((h) => h.id), [1]);
    assert.deepEqual(matchMentions('ping @britten.ivory', users).map((h) => h.id), [1]);
  });

  it('resolves a first-name mention followed by prose', () => {
    assert.deepEqual(matchMentions('@Britten please review', users).map((h) => h.id), [1]);
    assert.deepEqual(matchMentions('@Devin can you check?', users).map((h) => h.id), [3]);
  });

  it('resolves hyphenated display names', () => {
    assert.deepEqual(matchMentions('hey @Anne-Marie Doe', users).map((h) => h.id), [4]);
    assert.deepEqual(matchMentions('hey @anne.marie.doe', users).map((h) => h.id), [4]);
  });

  it('does not match users whose email only shares a prefix', () => {
    // brittensales@ must not be notified by @Britten or @britten.ivory.
    assert.deepEqual(matchMentions('@Britten', users).map((h) => h.id), [1]);
    assert.deepEqual(matchMentions('@brittensales', users).map((h) => h.id), [5]);
  });

  it('resolves a full email mention by dropping the domain', () => {
    assert.deepEqual(
      matchMentions('cc @test.user@milsonfoundry.com', users).map((h) => h.id),
      [2],
    );
  });

  it('resolves multiple mentions and ignores non-users', () => {
    const hits = matchMentions('@Devin Verify and @Test User, not @ghost', users);
    assert.deepEqual(hits.map((h) => h.id).sort(), [2, 3]);
  });

  it('returns no matches when there are no mentions or no users match', () => {
    assert.deepEqual(matchMentions('no tags here', users), []);
    assert.deepEqual(matchMentions('hey @nobody.real', users), []);
  });
});
