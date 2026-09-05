// FILE: renderer/render-plans.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
ESP.planBoxHtml = function (account, plan) {
  const trainedDone = ESP.planTrainedSatisfied(account, plan);
  const queueDone = ESP.planIsSatisfied(account, plan);
  let boxClass = 'plan-box';
  if (trainedDone) {
    boxClass += ' plan-done-red';
  } else if (queueDone) {
    boxClass += ' plan-glow';
  }
  const scopeLabel =
    plan.scope === 'global' ? 'All characters' : 'Character-specific';
  return `
<div class="${boxClass}" data-plan-id="${ESP.escapeHtml(plan.id)}">
  <div class="plan-box-name">
    ${ESP.escapeHtml(plan.name)}
  </div>
  <div class="plan-box-meta">
    ${scopeLabel} · ${Array.isArray(plan.entries) ? plan.entries.length : 0} skills
  </div>
  <button type="button" class="plan-delete" data-plan-id="${ESP.escapeHtml(plan.id)}">
    Delete
  </button>
</div>
`;
};
ESP.skillPlansTabHtml = function (account) {
  const applicablePlans = ESP.state.plans.filter((plan) =>
    ESP.planAppliesToAccount(plan, account)
  );
  if (!applicablePlans.length) {
    return `
<div class="idle">
No skill plans available for this character yet.<br /><br />
Use <strong>Add plan from clipboard</strong> at the top to create one.
</div>
`;
  }
  return `
<div class="plans-grid">
  ${applicablePlans.map((plan) => ESP.planBoxHtml(account, plan)).join('')}
</div>
`;
};