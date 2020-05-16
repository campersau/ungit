const ko = require('knockout');
const octicons = require('octicons');
const components = require('ungit-components');
const programEvents = require('ungit-program-events');

components.register('submodules', (args) => new SubmodulesViewModel(args.server, args.repoPath));

class SubmodulesViewModel {
  constructor(server, repoPath) {
    this.repoPath = repoPath;
    this.server = server;
    this.submodules = ko.observableArray();
    this.isUpdating = false;
    this.submodulesIcon = octicons['file-submodule'].toSVG({ height: 18 });
    this.closeIcon = octicons.x.toSVG({ height: 18 });
    this.linkIcon = octicons['link-external'].toSVG({ height: 18 });
  }

  onProgramEvent(event) {
    if (event.event == 'submodule-fetch') this.fetchSubmodules();
  }

  updateNode(parentElement) {
    this.fetchSubmodules().then(() => {
      ko.renderTemplate('submodules', this, {}, parentElement);
    });
  }

  async fetchSubmodules() {
    try {
      const submodules = await this.server.getPromise('/submodules', { path: this.repoPath() });

      this.submodules(submodules && Array.isArray(submodules) ? submodules : []);
    } catch (e) {
      this.server.unhandledRejection(e);
    }
  }

  async updateSubmodules() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    try {
      await this.server.postPromise('/submodules/update', { path: this.repoPath() });
    } catch (e) {
      this.server.unhandledRejection(e);
    } finally {
      this.isUpdating = false;
    }
  }

  showAddSubmoduleDialog() {
    components
      .create('addsubmoduledialog')
      .show()
      .closeThen(async (diag) => {
        if (!diag.isSubmitted()) return;
        this.isUpdating = true;
        try {
          await this.server.postPromise('/submodules/add', {
            path: this.repoPath(),
            submoduleUrl: diag.url(),
            submodulePath: diag.path(),
          });
          programEvents.dispatch({ event: 'submodule-fetch' });
        } catch (e) {
          this.server.unhandledRejection(e);
        } finally {
          this.isUpdating = false;
        }
      });
  }

  submoduleLinkClick(submodule) {
    window.location.href = submodule.url;
  }

  submodulePathClick(submodule) {
    window.location.href = document.URL + ungit.config.fileSeparator + submodule.path;
  }

  submoduleRemove(submodule) {
    components
      .create('yesnodialog', {
        title: 'Are you sure?',
        details: `Deleting ${submodule.name} submodule cannot be undone with ungit.`,
      })
      .show()
      .closeThen(async (diag) => {
        if (!diag.result()) return;
        try {
          await this.server.delPromise('/submodules', {
            path: this.repoPath(),
            submodulePath: submodule.path,
            submoduleName: submodule.name,
          });
          programEvents.dispatch({ event: 'submodule-fetch' });
        } catch (e) {
          this.server.unhandledRejection(e);
        }
      });
  }
}
