'use strict';

const electron = require('electron');
const { app, BrowserWindow, Menu, Tray, dialog } = electron;
const isDev = !require('electron').app.isPackaged;
const settings = require('electron-settings');
const { writePath } = require('./spring_platform');
const { config } = require('./launcher_config');

let mainWindow;
let tray;

app.on('second-instance', () => {
	// Someone tried to run a second instance, we should focus our window.
	const mainWindow = gui.getMainWindow();
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.focus();
	}
});

app.prependListener('ready', () => {
	const { wizard } = require('./launcher_wizard');

	const display = electron.screen.getPrimaryDisplay();
	const sWidth = display.workAreaSize.width;
	const width = 800;
	const height = process.platform === 'win32' ? 418 : 380 + 8;

	let windowOpts = {
		x: (sWidth - width) / 2,
		// y: (sHeight - height) / 2,
		y: 100,
		width: width,
		height: height,
		show: false,
		icon: `${__dirname}/renderer/spring-icon.png`,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true,
			contextIsolation: false,
			worldSafeExecuteJavaScript: false,
		},
	};
	windowOpts.resizable = true; // enable resizing here, because this is what gets passed to spring.exe, and we want that to be resizeable
	Menu.setApplicationMenu(null);
	mainWindow = new BrowserWindow(windowOpts);

	require('@electron/remote/main').enable(mainWindow.webContents);

	mainWindow.loadFile(`${__dirname}/renderer/index.html`);
	if (isDev) {
		// mainWindow.webContents.openDevTools();
	}

	mainWindow.on('closed', () => {
		mainWindow = null;
		app.quit();
	});

	tray = new Tray(`${__dirname}/renderer/spring-icon.png`);
	var template = [
		// TODO: About dialog that shows URL, author, version, etc.
		// {
		//   role: 'about',
		//   click: () => {
		//     log.info("About clicked");
		//   }
		// },
		{
			// TODO: Proper "show/hide"
			label: 'Toggle hide',
			click: () => {
				if (mainWindow.isVisible()) {
					//menuItem.label = "Show";
					mainWindow.hide();
				} else {
					mainWindow.show();
					//menuItem.label = "Hide";
				}
			}
		},
		// TODO: Settings dialog for user config
		{ role: 'quit' }
	];
	if (process.platform === 'linux') {
		// template.unshift([{label: 'Spring-Launcher'}]);
	}
	// tray.setToolTip('Spring-Launcher: Distribution system for SpringRTS.');
	tray.setToolTip(config.title);
	tray.setContextMenu(Menu.buildFromTemplate(template));

	mainWindow.once('ready-to-show', () => {
		mainWindow.show();
		//mainWindow.resizable = false; // Disable resizing of the launcher window, this does not get passed to spring.exe

		function isPrintableASCII(str) {
			return /^[\x20-\x7F]*$/.test(str);
		}

		if (process.platform == 'win32' &&
			!isPrintableASCII(writePath) &&
			!config.disable_win_ascii_install_path_check) {
			dialog.showMessageBoxSync(mainWindow, {
				type: 'error',
				title: 'Non-English alphabet install directory',
				buttons: ['OK'],
				message: 'Game installation path contains non-English alphabet characters.',
				detail:
					`Current installation location "${writePath}" constains non-English alphabet letters (non-ASCII characters). ` +
					'Examples of such problematic characters are: ą 자 ö ł β. ' +
					'It is currently not supported and will cause game to crash. \r\n\r\n' +
					'Please reinstall the game under a different location that contains only English alphabet characters.',
				noLink: true,
			});
			app.quit();
		}

		gui.send('all-configs', config.getAvailableConfigs());

		const { generateAndBroadcastWizard } = require('./launcher_wizard_util');
		generateAndBroadcastWizard();

		if (config.no_downloads && config.auto_start) {
			wizard.nextStep();
		} else if (config.auto_download) {
			gui.send('wizard-started');
			wizard.nextStep();
		} else {
			gui.send('wizard-stopped');
		}
	});
});

class GUI {
	send(...args) {
		if (mainWindow && mainWindow.webContents) {
			mainWindow.webContents.send(...args);
		}
	}

	getMainWindow() {
		return mainWindow;
	}
}

const gui = new GUI();

module.exports = {
	gui: gui,
};
