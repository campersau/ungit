const ko = require('knockout');
const components = require('ungit-components');
const addressParser = require('ungit-address-parser');
const navigation = require('ungit-navigation');
const programEvents = require('ungit-program-events');

components.register('path', (args) => {
  return new PathViewModel(args.server, args.path);
});

class PathViewModel {
  constructor(server, path) {
    this.server = server;
    this.repoPath = ko.observable(path);
    this.dirName =
      this.repoPath()
        .replace(/\\/g, '/')
        .split('/')
        .filter((s) => s)
        .slice(-1)[0] || '/';

    this.status = ko.observable('loading');
    this.cloneUrl = ko.observable();
    this.showDirectoryCreatedAlert = ko.observable(false);
    this.cloneDestinationImplicit = ko.computed(() => {
      const defaultText = 'destination folder';
      if (!this.cloneUrl()) return defaultText;

      const parsedAddress = addressParser.parseAddress(this.cloneUrl());
      return parsedAddress.shortProject || defaultText;
    });
    this.cloneDestination = ko.observable();
    this.repository = ko.observable();
    this.isRecursiveSubmodule = ko.observable(true);
  }

  updateNode(parentElement) {
    ko.renderTemplate('path', this, {}, parentElement);
  }
  shown() {
    this.updateStatus();
  }
  updateAnimationFrame(deltaT) {
    if (this.repository()) this.repository().updateAnimationFrame(deltaT);
  }
  async updateStatus() {
    try {
      const status = await this.server.getPromise('/quickstatus', { path: this.repoPath() });

      if (status.type == 'inited' || status.type == 'bare') {
        if (this.repoPath() !== status.gitRootPath) {
          this.repoPath(status.gitRootPath);
          programEvents.dispatch({ event: 'navigated-to-path', path: this.repoPath() });
          programEvents.dispatch({ event: 'working-tree-changed' });
        }
        this.status(status.type);
        if (!this.repository()) {
          this.repository(components.create('repository', { server: this.server, path: this }));
        }
      } else if (status.type == 'uninited' || status.type == 'no-such-path') {
        this.status(status.type);
        this.repository(null);
      }
      return null;
    } catch (err) {}
  }
  async initRepository() {
    try {
      await this.server.postPromise('/init', { path: this.repoPath() });
    } catch (e) {
      this.server.unhandledRejection(e);
    } finally {
      this.updateStatus();
    }
  }
  onProgramEvent(event) {
    if (event.event == 'working-tree-changed') this.updateStatus();
    else if (event.event == 'request-app-content-refresh') this.updateStatus();

    if (this.repository()) this.repository().onProgramEvent(event);
  }
  async cloneRepository() {
    this.status('cloning');
    const dest = this.cloneDestination() || this.cloneDestinationImplicit();

    try {
      const res = await this.server.postPromise('/clone', {
        path: this.repoPath(),
        url: this.cloneUrl(),
        destinationDir: dest,
        isRecursiveSubmodule: this.isRecursiveSubmodule(),
      });
      navigation.browseTo('repository?path=' + encodeURIComponent(res.path));
    } catch (e) {
      this.server.unhandledRejection(e);
    } finally {
      programEvents.dispatch({ event: 'working-tree-changed' });
    }
  }
  async createDir() {
    this.showDirectoryCreatedAlert(true);

    try {
      await this.server.postPromise('/createDir', { dir: this.repoPath() });
    } catch (e) {
      this.server.unhandledRejection(e);
    }

    return this.updateStatus();
  }
}
