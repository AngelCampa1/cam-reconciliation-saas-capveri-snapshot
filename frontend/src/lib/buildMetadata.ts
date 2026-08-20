export interface BuildMetadata {
  app: 'frontend'
  version: string
  commit: string
  environment: string
}

export function getBuildMetadata(): BuildMetadata {
  return {
    app: 'frontend',
    version: import.meta.env.VITE_APP_VERSION || '0.1.0',
    commit:
      import.meta.env.VITE_BUILD_COMMIT ||
      import.meta.env.VITE_CF_COMMIT_SHA ||
      import.meta.env.VITE_GITHUB_SHA ||
      'unknown',
    environment: import.meta.env.MODE || 'unknown',
  }
}

export function writeBuildMetadataTag(): void {
  if (typeof document === 'undefined') {
    return
  }

  const existing = document.getElementById('capveri-build-metadata')
  const tag = existing ?? document.createElement('script')
  tag.id = 'capveri-build-metadata'
  tag.setAttribute('type', 'application/json')
  tag.textContent = JSON.stringify(getBuildMetadata())

  if (!existing) {
    document.head.appendChild(tag)
  }
}
