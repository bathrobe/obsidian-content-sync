import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";
const path = require("path");
const fs = require("fs");

interface ContentSyncSettings {
	pathToContentFolder: string;
	contentKey: string;
}

const DEFAULT_SETTINGS: ContentSyncSettings = {
	pathToContentFolder: path.join(
		process.env.HOME,
		"path",
		"to",
		"content",
		"folder"
	),
	contentKey: "publish_to_content_folder",
};
export default class ContentSyncPlugin extends Plugin {
	settings: ContentSyncSettings;

	async onload() {
		await this.loadSettings();
		const { vault } = this.app;

		async function getFilesToPublish(frontmatterKey: string) {
			const filesToPublish = await Promise.all(
				vault
					.getMarkdownFiles()
					.filter(
						(file) =>
							app.metadataCache.getFileCache(file)?.frontmatter?.[
								frontmatterKey
							]
					)
			);
			return filesToPublish;
		}
		const basePath = (this.app.vault.adapter as any).basePath;
		async function getVaultPath(file: TFile) {
			return path.join(basePath, file.parent.path, file.path);
		}
		async function syncFiles(settings: ContentSyncSettings) {
			const { pathToContentFolder, contentKey } = settings;
			const filesToPublish = await getFilesToPublish(contentKey);
			filesToPublish.forEach(async (file) => {
				const vaultPath = await getVaultPath(file);
				const destinationPath = path.join(
					pathToContentFolder,
					file.path
				);
				if (
					!fs.existsSync(destinationPath) ||
					fs.statSync(vaultPath).mtimeMs >
						fs.statSync(destinationPath)?.mtimeMs
				) {
					try {
						if (!fs.existsSync(destinationPath)) {
							new Notice(`adding ${file.path}`);
						} else {
							new Notice(`updating ${file.path}`);
						}
						fs.copyFileSync(vaultPath, destinationPath);
					} catch (err) {
						new Notice(`Error: ${err}`);
					}
				}
				// now we check if any files exist in the destination folder that don't exist in filesToPublish
				const filesInDestinationFolder =
					fs.readdirSync(pathToContentFolder);
				filesInDestinationFolder.forEach((file: string) => {
					const fileExists = filesToPublish.find(
						(f) => f.path === file
					);
					if (!fileExists) {
						new Notice(`removing ${file}`);
						fs.unlinkSync(path.join(pathToContentFolder, file));
					}
				});
			});
		}

		this.addCommand({
			id: "sync-files-with-content-folder",
			name: "Sync files with content folder",
			callback: async () => {
				await syncFiles(this.settings);
				return new Notice(`Sync complete`);
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ContentSyncSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ContentSyncSettingTab extends PluginSettingTab {
	plugin: ContentSyncPlugin;

	constructor(app: App, plugin: ContentSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Setting up your sync to external content folder.",
		});

		new Setting(containerEl)
			.setName("Path to content folder")
			.setDesc(
				"Path to the folder where you want to copy over selected files."
			)
			.addText((text) =>
				text
					.setPlaceholder("Path here")
					.setValue(this.plugin.settings.pathToContentFolder)
					.onChange(async (value) => {
						this.plugin.settings.pathToContentFolder = value;
						await this.plugin.saveSettings();
					})
			);
		containerEl.createEl("h2", {
			text: "Frontmatter key that indicates a file should be synced.",
		});
		new Setting(containerEl)
			.setName("Frontmatter key")
			.setDesc("Value should be set to `true` to copy file over.")
			.addText((text) =>
				text
					.setPlaceholder("Key here")
					.setValue(this.plugin.settings.contentKey)
					.onChange(async (value) => {
						this.plugin.settings.contentKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
