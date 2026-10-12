import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Pages is manual main-only and browser checks block artifact upload and deployment',()=>{
  const deploy=readFileSync('.github/workflows/deploy-pages.yml','utf8');
  const triggers=deploy.slice(deploy.indexOf('\non:'),deploy.indexOf('\npermissions:'));
  assert.match(triggers,/workflow_dispatch:/);assert.doesNotMatch(triggers,/push:|pull_request:|workflow_run:/);
  assert.match(deploy,/if: github\.ref == 'refs\/heads\/main'/);assert.match(deploy,/needs: build/);
  assert.ok(deploy.indexOf('npm run test:browser')<deploy.indexOf('actions/upload-pages-artifact'));
  assert.doesNotMatch(deploy,/continue-on-error/);
  assert.match(readFileSync('.github/workflows/check.yml','utf8'),/pull_request:[\s\S]*npm run test:browser/);
});
