# Release Process

1. Create a changeset:
   - `pnpm changeset`
2. Version packages:
   - `pnpm version-packages`
3. Publish to npm:
   - `pnpm release`

This repo uses a fixed version group for:
- `@flypigeon/shared`
- `@flypigeon/node`
- `@flypigeon/react`

Those three packages stay on the same version.
