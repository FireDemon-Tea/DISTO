# Release Guide

This guide explains how to create new releases for the Fabric Metrics Bridge mod.

## Creating a Release

### 1. Update Version
Update the version in `src/main/resources/fabric.mod.json`:
```json
{
    "version": "1.0.0"
}
```

### 2. Create a Git Tag
```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

### 3. GitHub Actions
The GitHub Actions workflow will automatically:
- Build the mod using Gradle
- Create a release on GitHub
- Upload the JAR file as a release asset
- Generate release notes

### 4. Verify Release
1. Go to the [Releases](https://github.com/yourusername/fabric-metrics-bridge/releases) page
2. Verify the new release appears
3. Download and test the JAR file

## Version Numbering

Follow semantic versioning:
- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backward compatible
- **PATCH** (0.0.1): Bug fixes, backward compatible

## Release Notes

The GitHub Actions workflow automatically generates release notes from:
- Commit messages since the last release
- Pull requests merged since the last release
- Issues closed since the last release

## Manual Release (if needed)

If you need to create a release manually:
1. Go to GitHub Releases page
2. Click "Create a new release"
3. Choose a tag version (e.g., v1.0.0)
4. Add release title and description
5. Upload the JAR file from `build/libs/`
6. Publish the release
