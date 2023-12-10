'use strict';

const { spawn } = require('child_process');
const EventEmitter = require('events');

const log = require('electron-log');

const springPlatform = require('./spring_platform');
const fs = require('fs');

class PrdDownloader extends EventEmitter {
	constructor() {
		super();
		this.progressPattern = new RegExp('[0-9]+/[0-9]+');
		this.missingPattern = new RegExp('.*no engine.*|.*no mirrors.*|.*no game found.*|.*no map found.*|.*error occured while downloading.*');
	}

	errorCheck(name, line) {
		if (line.startsWith('[Error]')) {
			if (line.toLowerCase().match(this.missingPattern)) {
				this.emit('failed', name, line);
				return true;
			}
		}
		return false;
	}

	downloadPackage(name, args) {
		let finished = false;

		if (!fs.existsSync(springPlatform.prDownloaderPath)) {
			if (process.platform == 'win32') {
				this.emit('failed', name,
					'\'pr-downloader.exe\' file is missing. This issue may be caused by an ' +
					'antivirus program, such as Avast, accidentally deleting the file. ' +
					'Please ensure your antivirus is up-to-date and reinstall the game.');
			} else {
				this.emit('failed', name,
					'pr-downloader binary not found in the installation directory.');
			}
			return;
		}

		const prd = spawn(springPlatform.prDownloaderPath, args);
		this.emit('started', name);

		prd.stdout.on('data', (data) => {
			const line = data.toString();
			log.info(line);
			if (line.startsWith('[Progress]')) {
				const matched = line.match(this.progressPattern);
				if (!matched || matched.length == 0) {
					return;
				}
				const progressStr = matched[0];
				var [current, total] = progressStr.split('/');
				current = parseInt(current);
				total = parseInt(total);
				this.emit('progress', name, current, total);
			} else if (this.errorCheck(name, line)) {
				finished = true;
			} else if (line.startsWith('[Info]')) {
				this.emit('info', name, line);
			}
		});

		prd.stderr.on('data', (data) => {
			const line = data.toString();
			log.warn(line);
			if (this.errorCheck(name, line)) {
				finished = true;
			}
		});


		prd.on('close', (code) => {
			if (finished) { // the process already counts as finished
				return;
			}
			if (code == 0) {
				this.emit('finished', name);
			} else {
				this.emit('failed', name, `Download failed: ${name}: ${code}`);
			}
		});

		prd.on('error', (error) => {
			finished = true;
			this.emit('failed', name, `Failed to launch pr-downloader: ${error}`);
		});

		this.prd = prd;
		this.name = name;
	}


	downloadEngine(engineName) {
		this.downloadPackage(engineName, ['--filesystem-writepath', springPlatform.writePath, '--download-engine', engineName]);
	}

	downloadGames(gameNames) {
		const args = ['--filesystem-writepath', springPlatform.writePath];
		for (const game of gameNames) {
			args.push(...['--download-game', game])
		}

		this.downloadPackage(gameNames.join(', '), args);
	}

	downloadMap(mapName) {
		this.downloadPackage(mapName, ['--filesystem-writepath', springPlatform.writePath, '--download-map', mapName]);
	}

	downloadResource(resource) {
		throw `downloadResource(${resource['url']}, ${resource[']destination']}): pr_downloader cannot be used to download resources`;
	}

	stopDownload() {
		if (this.name == null) {
			return;
		}

		// this.prd.kill('SIGKILL');
		this.prd.kill(9);
		this.emit('aborted', this.name, 'Download interrupted via user action.');
	}
}

module.exports = new PrdDownloader();
