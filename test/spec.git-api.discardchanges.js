const expect = require('expect.js');
const request = require('supertest');
const express = require('express');
const path = require('path');
const restGit = require('../source/git-api');
const common = require('./common-es6.js');

const app = express();
app.use(require('body-parser').json());

restGit.registerApi({ app: app, config: { dev: true } });

const req = request(app);

describe('git-api discardchanges', () => {
  after(() => common.post(req, '/testing/cleanup'));

  it('should be able to discard a new file', async () => {
    const dir = await common.createSmallRepo(req);
    const testFile1 = 'test.txt';

    await common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });

    await common.post(req, '/discardchanges', { path: dir, file: testFile1 });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be able to discard a changed file', async () => {
    const dir = await common.createSmallRepo(req);
    const testFile1 = 'test.txt';

    await common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });

    await common.post(req, '/commit', { path: dir, message: 'lol', files: [{ name: testFile1 }] });
    await common.post(req, '/testing/changefile', { file: path.join(dir, testFile1) });
    await common.post(req, '/discardchanges', { path: dir, file: testFile1 });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be able to discard a removed file', async () => {
    const dir = await common.createSmallRepo(req);
    const testFile1 = 'test.txt';

    await common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });

    await common.post(req, '/commit', { path: dir, message: 'lol', files: [{ name: testFile1 }] });
    await common.post(req, '/testing/removefile', { file: path.join(dir, testFile1) });
    await common.post(req, '/discardchanges', { path: dir, file: testFile1 });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be able to discard a new and staged file', async () => {
    const dir = await common.createSmallRepo(req);
    const testFile1 = 'test.txt';

    await common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });

    await common.post(req, '/testing/git', { path: dir, command: ['add', testFile1] });
    await common.post(req, '/discardchanges', { path: dir, file: testFile1 });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be able to discard a staged and removed file', async () => {
    const dir = await common.createSmallRepo(req);
    const testFile1 = 'test.txt';

    await common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });

    await common.post(req, '/testing/git', { path: dir, command: ['add', testFile1] });
    await common.post(req, '/testing/removefile', { file: path.join(dir, testFile1) });
    await common.post(req, '/discardchanges', { path: dir, file: testFile1 });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be able to discard discard submodule changes', async function () {
    const testFile = 'smalltestfile.txt';
    const submodulePath = 'subrepo';
    this.timeout(5000);

    const dir2 = await common.createSmallRepo(req);
    const subrepoDir = await common.createSmallRepo(req);

    await common.post(req, '/submodules/add', {
      submoduleUrl: subrepoDir,
      submodulePath: submodulePath,
      path: dir2,
    });

    const dir = await dir2;

    await common.post(req, '/commit', {
      path: dir,
      message: 'lol',
      files: [{ name: '.gitmodules' }],
    });

    await common.post(req, '/testing/changefile', {
      file: path.join(dir, submodulePath, testFile),
    });

    await common.post(req, '/discardchanges', { path: dir, file: submodulePath });

    const res = await common.get(req, '/status', { path: dir });

    expect(Object.keys(res.files).length).to.be(0);
  });

  // Need to make discardchanges even more powerful to handle this
  /*it('should be able to discard a commited, staged and removed file', () => {
    common.createSmallRepo(req, function(dir) {
      if (err) return done(err);
      const testFile1 = 'test.txt';

        () => {common.post(req, '/testing/createfile', { file: path.join(dir, testFile1) });
        () => {common.post(req, '/commit', { path: dir, message: 'lol', files: [{ name: testFile1 }] });
        () => {common.post(req, '/testing/changefile', { file: path.join(dir, testFile1) });
        () => {common.post(req, '/testing/git', { path: dir, command: ['add', testFile1] });
        () => {common.post(req, '/testing/removefile', { file: path.join(dir, testFile1) });
        () => {common.post(req, '/discardchanges', { path: dir, file: testFile1 });
        () => {common.get(req, '/status', { path: dir }).then((res) => {
          if (err) return done(err);
          expect(Object.keys(res.files).length).to.be(0);
          done();
        }); },
      ], done);
    });
  });*/
});
