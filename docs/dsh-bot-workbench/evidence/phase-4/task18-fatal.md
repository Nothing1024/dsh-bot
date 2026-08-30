locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByTitle('DSH Bot', { exact: true }).last()
    - locator resolved to <button type="button" title="DSH Bot" class="nArs4W_paneCard">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    16 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

    at openDshBotTab (/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/docs/dsh-bot-workbench/evidence/phase-4/task18-realrun.mjs:227:25)
    at async uf201DualEntry (/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/docs/dsh-bot-workbench/evidence/phase-4/task18-realrun.mjs:385:17)
    at async main (/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/docs/dsh-bot-workbench/evidence/phase-4/task18-realrun.mjs:984:3)