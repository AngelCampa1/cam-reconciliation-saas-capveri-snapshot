# Story 0.4: Configure Frontend with Vite

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.1
- **Status**: `pending`

## User Story
**As a** frontend developer
**I want** a React 19 application scaffolded with Vite and TypeScript strict mode
**So that** I can develop UI components with modern tooling and type safety

## Acceptance Criteria
- [ ] **AC1**: `package.json` exists in `frontend/` with correct metadata
- [ ] **AC2**: React 19 and React DOM installed
- [ ] **AC3**: TypeScript configured in strict mode
- [ ] **AC4**: Vite configured as build tool
- [ ] **AC5**: `npm install` succeeds without errors
- [ ] **AC6**: `npm run dev` starts dev server on `localhost:5173`
- [ ] **AC7**: `npm run build` produces production build in `dist/`
- [ ] **AC8**: Basic App component renders "CapVeri" text

## Technical Specifications
**Files to Create**:
```
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    └── vite-env.d.ts
```

**tsconfig.json** (strict mode):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "types": ["vite/client"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Dependencies**:
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0"
  }
}
```

## Definition of Done
- [ ] Fresh `npm install` works
- [ ] Dev server starts and shows React app
- [ ] No TypeScript errors in strict mode
- [ ] Production build succeeds
