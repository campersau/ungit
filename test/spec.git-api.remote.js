const expect = require('expect.js');
const request = require('supertest');
const _ = require('lodash');
const express = require('express');
const path = require('path');
const restGit = require('../source/git-api');
const common = require('./common-es6.js');

const app = express();
app.use(require('body-parser').json());

restGit.registerApi({ app: app, config: { dev: true } });

let testDirLocal1, testDirLocal2, testDirRemote;

const req = request(app);

describe('git-api remote', function () {
  this.timeout(4000);

  before('creating test dirs should work', async () => {
    const dir3 = await common.post(req, '/testing/createtempdir');

    testDirLocal1 = dir3.path;
    const dir2 = await common.post(req, '/testing/createtempdir');
    testDirLocal2 = dir2.path;
    const dir = await common.post(req, '/testing/createtempdir');

    testDirRemote = dir.path;
  });

  after(() => common.post(req, '/testing/cleanup'));

  it('init a bare "remote" test dir should work', () => {
    return common.post(req, '/init', { path: testDirRemote, bare: true });
  });

  it('remotes in no-remotes-repo should be zero', async () => {
    const res = await common.get(req, '/remotes', { path: testDirRemote });

    expect(res.length).to.be(0);
  });

  it('cloning "remote" to "local1" should work', () => {
    return common.post(req, '/clone', {
      path: testDirLocal1,
      url: testDirRemote,
      destinationDir: '.',
    });
  });

  it('remotes in cloned-repo should be one', async () => {
    const res = await common.get(req, '/remotes', { path: testDirLocal1 });
    expect(res.length).to.be(1);
    expect(res[0]).to.be('origin');
  });

  it('remote/origin in cloned-repo should work', async () => {
    const res = await common.get(req, '/remotes/origin', { path: testDirLocal1 });

    expect(res.address).to.be(testDirRemote);
  });

  it('creating a commit in "local1" repo should work', async () => {
    const testFile = path.join(testDirLocal1, 'testfile1.txt');
    await common.post(req, '/testing/createfile', { file: testFile });
    return common.post(req, '/commit', {
      path: testDirLocal1,
      message: 'Init',
      files: [{ name: testFile }],
    });
  });

  it('log in "local1" should show the init commit', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal1 });
    expect(res.nodes).to.be.a('array');
    expect(res.nodes.length).to.be(1);
    const init = res.nodes[0];
    expect(init.message.indexOf('Init')).to.be(0);
    expect(init.refs).to.contain('HEAD');
    expect(init.refs).to.contain('refs/heads/master');
  });

  it('pushing form "local1" to "remote" should work', () => {
    return common.post(req, '/push', { path: testDirLocal1, remote: 'origin' });
  });

  it('cloning "remote" to "local2" should work', () => {
    return common.post(req, '/clone', {
      path: testDirLocal2,
      url: testDirRemote,
      destinationDir: '.',
      isRecursiveSubmodule: true,
    });
  });

  it('log in "local2" should show the init commit', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal2 });

    expect(res.nodes).to.be.a('array');
    expect(res.nodes.length).to.be(1);
    const init = res.nodes[0];
    expect(init.message.indexOf('Init')).to.be(0);
    expect(init.refs).to.contain('HEAD');
    expect(init.refs).to.contain('refs/heads/master');
    expect(init.refs).to.contain('refs/remotes/origin/master');
    expect(init.refs).to.contain('refs/remotes/origin/HEAD');
  });

  it('creating and pushing a commit in "local1" repo should work', async () => {
    const testFile = path.join(testDirLocal1, 'testfile2.txt');

    await common.post(req, '/testing/createfile', { file: testFile });

    await new Promise((resolve) => setTimeout(resolve, 500));

    await common.post(req, '/commit', {
      path: testDirLocal1,
      message: 'Commit2',
      files: [{ name: testFile }],
    });

    return common.post(req, '/push', { path: testDirLocal1, remote: 'origin' });
  });

  it('fetching in "local2" should work', () => {
    return common.post(req, '/fetch', { path: testDirLocal2, remote: 'origin' });
  });

  it('log in "local2" should show the branch as one behind', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal2 });

    expect(res.nodes).to.be.a('array');
    expect(res.nodes.length).to.be(2);
    const init = _.find(res.nodes, (node) => node.message.indexOf('Init') == 0);
    const commit2 = _.find(res.nodes, (node) => node.message.indexOf('Commit2') == 0);
    expect(init).to.be.ok();
    expect(commit2).to.be.ok();
    expect(init.refs).to.contain('HEAD');
    expect(init.refs).to.contain('refs/heads/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/HEAD');
  });

  it('rebasing local master onto remote master should work in "local2"', () => {
    return common.post(req, '/rebase', { path: testDirLocal2, onto: 'origin/master' });
  });

  it('log in "local2" should show the branch as in sync', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal2 });

    expect(res.nodes).to.be.a('array');
    expect(res.nodes.length).to.be(2);
    const init = _.find(res.nodes, (node) => node.message.indexOf('Init') == 0);
    const commit2 = _.find(res.nodes, (node) => node.message.indexOf('Commit2') == 0);
    expect(init).to.be.ok();
    expect(commit2).to.be.ok();
    expect(init.refs).to.eql([]);
    expect(commit2.refs).to.contain('HEAD');
    expect(commit2.refs).to.contain('refs/heads/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/HEAD');
  });

  it('creating a commit in "local2" repo should work', async () => {
    const testFile = path.join(testDirLocal2, 'testfile3.txt');

    await common.post(req, '/testing/createfile', { file: testFile });

    await new Promise((resolve) => setTimeout(resolve, 500));

    return common.post(req, '/commit', {
      path: testDirLocal2,
      message: 'Commit3',
      files: [{ name: testFile }],
    });
  });

  it('resetting local master to remote master should work in "local2"', () => {
    return common.post(req, '/reset', { path: testDirLocal2, to: 'origin/master', mode: 'hard' });
  });

  it('log in "local2" should show the branch as in sync', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal2 });

    expect(res.nodes.length).to.be(2);
    const init = _.find(res.nodes, (node) => node.message.indexOf('Init') == 0);
    const commit2 = _.find(res.nodes, (node) => node.message.indexOf('Commit2') == 0);
    expect(init.refs).to.eql([]);
    expect(commit2.refs).to.contain('HEAD');
    expect(commit2.refs).to.contain('refs/heads/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/master');
    expect(commit2.refs).to.contain('refs/remotes/origin/HEAD');
  });

  it('status should show nothing', async () => {
    const res = await common.get(req, '/status', { path: testDirLocal2 });

    expect(Object.keys(res.files).length).to.be(0);
  });

  it('should be possible to create a tag in "local2"', () => {
    return common.post(req, '/tags', { path: testDirLocal2, name: 'v1.0' });
  });

  it('should be possible to push a tag from "local2"', () => {
    return common.post(req, '/push', {
      path: testDirLocal2,
      remote: 'origin',
      refSpec: 'v1.0',
      remoteBranch: 'v1.0',
    });
  });

  it('log in "local2" should show the local tag', async () => {
    const res = await common.get(req, '/gitlog', { path: testDirLocal2 });
    const commit2 = _.find(res.nodes, (node) => node.message.indexOf('Commit2') == 0);
    expect(commit2.refs).to.contain('tag: refs/tags/v1.0');
  });

  it('remote tags in "local2" should show the remote tag', async () => {
    const res = await common.get(req, '/remote/tags', { path: testDirLocal2, remote: 'origin' });

    expect(res.map((tag) => tag.name)).to.contain('refs/tags/v1.0^{}');
  });
});
