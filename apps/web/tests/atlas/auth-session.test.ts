import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAuthSessionResponse } from '../../lib/wow/publicAuthSession.ts';

test('GET and POST session responses never serialize OAuth credentials and remain private', async () => {
  for (const method of ['GET','POST']) {
    const request = new Request('https://gildra.example/api/auth/session', {method});
    const response = Response.json({user:{id:'42',name:'Player',access_token:'nested-private'},expires:'future',battleNetAccessToken:'private-token',battleNetError:'AccessTokenExpired',accessToken:'unexpected'}, {headers:{'Set-Cookie':'session=renewed; HttpOnly; Secure','Content-Length':'999'}});
    const actual = await publicAuthSessionResponse(request,response);
    assert.deepEqual(await actual.json(),{user:{id:'42',name:'Player'},expires:'future'});
    assert.equal(actual.headers.get('cache-control'),'private, no-store');
    assert.equal(actual.headers.get('set-cookie'),'session=renewed; HttpOnly; Secure');
    assert.equal(actual.headers.has('content-length'),false);
  }
});
test('OAuth redirect responses are untouched; signed-out sessions remain null', async () => {
  const response = new Response(null,{status:302,headers:{Location:'https://eu.battle.net/oauth'}});
  assert.equal(await publicAuthSessionResponse(new Request('https://gildra.example/api/auth/signin/battlenet'),response),response);
  const result=await publicAuthSessionResponse(new Request('https://gildra.example/api/auth/session/'),Response.json(null));
  assert.equal(await result.json(),null);
});
