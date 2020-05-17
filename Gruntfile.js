const browserify = require('browserify');
const childProcess = require('child_process');
const cliColor = require('ansi-color');
const electronPackager = require('electron-packager');
const path = require('path');
const fs = require('fs');

module.exports = (grunt) => {
  const packageJson = grunt.file.readJSON('package.json');

  const components = fs
    .readdirSync('components', { withFileTypes: true })
    .filter((component) => component.isDirectory())
    .map((component) => component.name);

  const lessFiles = {
    'public/css/styles.css': ['public/less/styles.less'],
  };
  components
    .map((component) => `components/${component}/${component}`)
    .forEach((str) => (lessFiles[`${str}.css`] = `${str}.less`));

  grunt.initConfig({
    pkg: packageJson,
    less: {
      production: { files: lessFiles },
    },
    watch: {
      scripts: {
        files: ['public/source/**/*.js', 'source/**/*.js', 'components/**/*.js'],
        tasks: ['browserify-common', 'browserify-components'],
        options: {
          spawn: false,
        },
      },
      less: {
        files: ['public/less/*.less', 'public/styles/*.less', 'components/**/*.less'],
        tasks: ['less:production'],
        options: {
          spawn: false,
        },
      },
    },
    release: {
      options: {
        commitMessage: 'Release <%= version %>',
      },
    },

    copy: {
      main: {
        files: [
          // includes files within path
          {
            expand: true,
            flatten: true,
            src: ['node_modules/raven-js/dist/raven.min.js'],
            dest: 'public/js/',
          },
          {
            expand: true,
            flatten: true,
            src: ['node_modules/raven-js/dist/raven.min.js.map'],
            dest: 'public/js/',
          },
        ],
      },
    },
    clean: {
      electron: ['./build'],
      coverage: ['./coverage'],
      'coverage-unit': ['./coverage/coverage-unit'],
    },
    electron: {
      package: {
        options: {
          dir: '.',
          out: './build',
          icon: './public/images/icon',
          all: true,
          asar: true,
        },
      },
    },
    zip_directories: {
      electron: {
        files: [
          {
            filter: 'isDirectory',
            expand: true,
            cwd: './build',
            dest: './dist',
            src: '*',
          },
        ],
      },
    },
    mocha_istanbul: {
      unit: {
        src: './test',
        options: {
          coverageFolder: './coverage/coverage-unit',
          mask: 'spec.*.js',
        },
      },
    },
  });

  grunt.registerTask('browserify-common', '', function () {
    const done = this.async();
    const b = browserify('./public/source/main.js', {
      noParse: ['dnd-page-scroll', 'jquery', 'knockout'],
      debug: true,
    });
    b.require('./public/source/components.js', { expose: 'ungit-components' });
    b.require('./public/source/main.js', { expose: 'ungit-main' });
    b.require('./public/source/navigation.js', { expose: 'ungit-navigation' });
    b.require('./public/source/program-events.js', { expose: 'ungit-program-events' });
    b.require('./public/source/storage.js', { expose: 'ungit-storage' });
    b.require('./source/address-parser.js', { expose: 'ungit-address-parser' });
    b.require('bluebird', { expose: 'bluebird' });
    b.require('blueimp-md5', { expose: 'blueimp-md5' });
    b.require('diff2html', { expose: 'diff2html' });
    b.require('jquery', { expose: 'jquery' });
    b.require('knockout', { expose: 'knockout' });
    b.require('lodash', { expose: 'lodash' });
    b.require('./node_modules/snapsvg/src/mina.js', { expose: 'mina' });
    b.require('moment', { expose: 'moment' });
    b.require('@primer/octicons', { expose: 'octicons' });
    b.require('signals', { expose: 'signals' });
    const outFile = fs.createWriteStream('./public/js/ungit.js');
    outFile.on('close', () => done());
    b.bundle().pipe(outFile);
  });

  grunt.registerTask('browserify-components', '', function () {
    const done = this.async();
    Promise.all(
      components.map((component) => {
        return new Promise((resolve) => {
          const src = `./components/${component}/${component}.js`;
          if (!fs.existsSync(src)) {
            grunt.log.warn(
              `${src} does not exist. If this component is obsolete, please remove that directory or perform a clean build.`
            );
            resolve();
            return;
          }
          const b = browserify(src, {
            bundleExternal: false,
            debug: true,
          });
          const outFile = fs.createWriteStream(`./components/${component}/${component}.bundle.js`);
          outFile.on('close', () => resolve());
          b.bundle().pipe(outFile);
        });
      })
    ).then((results) => {
      grunt.log.ok(`Browserified ${results.length} components.`);
      done();
    });
  });

  grunt.registerTask(
    'travisnpmpublish',
    'Automatically publish to NPM via travis and create git tag.',
    function () {
      const done = this.async();
      if (
        process.env.TRAVIS_BRANCH != 'master' ||
        (process.env.TRAVIS_PULL_REQUEST && process.env.TRAVIS_PULL_REQUEST != 'false')
      ) {
        grunt.log.writeln('Skipping travis npm publish');
        return done();
      }
      childProcess.exec('git rev-parse --short HEAD', (err, stdout, stderr) => {
        const hash = stdout.trim();
        const packageJson = JSON.parse(fs.readFileSync('package.json'));
        const version = packageJson.version;
        packageJson.version += `+${hash}`;
        fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
        fs.writeFileSync('.npmrc', '//registry.npmjs.org/:_authToken=' + process.env.NPM_TOKEN);
        childProcess.exec('npm publish', (err) => {
          if (err) done(err);
          else
            childProcess.exec(
              `git tag v${version} && git push -q https://${process.env.GITHUB_TOKEN}@github.com/FredrikNoren/ungit.git v${version}`,
              (err) => {
                done(err);
              }
            );
        });
      });
    }
  );

  grunt.registerTask('electronpublish', ['zip_directories:electron']);

  /**
   * Run clicktest in parallel at test suite level.
   * This test does intermittently fails depends on the maxConcurrency level set
   * above and the capacity of the computer as sometimes lack of resource allocation
   * triggers timeouts.
   * Use at own discretion.
   */
  grunt.registerTask('clickParallel', 'Parallelized click tests.', function () {
    const done = this.async();

    fs.promises
      .readdir('./clicktests')
      .then((files) => files.filter((file) => file.startsWith('spec.')))
      .then((tests) => {
        const genericIndx = tests.indexOf('spec.generic.js');
        if (genericIndx > -1) {
          tests.splice(0, 0, tests.splice(genericIndx, 1)[0]);
        }
        return tests;
      })
      .then((tests) => {
        grunt.log.writeln('Running click tests in parallel... (this will take a while...)');
        return Promise.all(
          tests.map((file) => {
            let output = '';
            const outStream = (data) => (output += data);

            grunt.log.writeln(cliColor.set(`Clicktest started! \t${file}`, 'blue'));
            return new Promise((resolve, reject) => {
              const child = childProcess.execFile(
                './node_modules/mocha/bin/mocha',
                [path.join(__dirname, 'clicktests', file), '--timeout=35000', '-b'],
                { maxBuffer: 10 * 1024 * 1024 }
              );
              child.stdout.on('data', outStream);
              child.stderr.on('data', outStream);
              child.on('exit', (code) => {
                if (code == 0) resolve(file);
                else reject();
              });
            })
              .then(() => {
                grunt.log.writeln(cliColor.set(`'Clicktest success! \t${file}`, 'green'));
                return { name: file, output: output, isSuccess: true };
              })
              .catch(() => {
                grunt.log.writeln(cliColor.set(`'Clicktest fail! \t'${file}`, 'red'));
                return { name: file, output: output, isSuccess: false };
              });
          })
        );
      })
      .then((results) => {
        let isSuccess = true;
        results.forEach((result) => {
          if (!result.isSuccess) {
            grunt.log.writeln(`---- start of ${result.name} log ----`);
            grunt.log.writeln(result.output);
            grunt.log.writeln(`----- end of ${result.name} log -----`);
            isSuccess = false;
          }
        });
        done(isSuccess);
      });
  });

  grunt.registerMultiTask('electron', 'Package Electron apps', function () {
    const done = this.async();
    electronPackager(this.options()).then(() => {
      done();
    }, done);
  });

  grunt.event.on('coverage', (lcovFileContents) => {
    // Check below on the section "The coverage event"
    console.log(lcovFileContents);
    console.log('\n\n=== html report: ./coverage/coverage-unit/lcove-report/index.html ===\n\n');
  });

  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-mocha-istanbul');
  grunt.loadNpmTasks('grunt-zip-directories');

  // Default task, builds everything needed
  grunt.registerTask('default', [
    'less',
    'browserify-common',
    'browserify-components',
    'copy:main',
  ]);

  // Builds, and then creates a release (bump patch version, create a commit & tag, publish to npm)
  grunt.registerTask('publish', ['default', 'release:patch']);

  // Same as publish but for minor version
  grunt.registerTask('publishminor', ['default', 'release:minor']);

  // Create electron package
  grunt.registerTask('package', ['default', 'clean:electron', 'electron']);

  // run unit test coverage, assumes project is compiled
  grunt.registerTask('coverage-unit', ['clean:coverage-unit', 'mocha_istanbul:unit']);
};
