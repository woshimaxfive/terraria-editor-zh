import React from 'react';
import { MASK_FIELDS, MASK_MODES, masksFromSample, modesFor, needsValue, validMasks } from '../editing/masks.js';

export default function MaskControls({ enabled, onEnabled, rules, onRules, sample, disabled }) {
  const change = (index, value) => onRules(rules.map((rule, i) => i === index ? value : rule));
  const fresh = field => ({ field: field.id, mode: field.quantity ? 'equal' : 'match', ...(field.boolean ? {} : { value: field.empty ?? field.min }) });
  return <details className="mask-controls">
    <summary>掩码 · 条件过滤{enabled ? `（${rules.filter(rule => rule.mode !== 'off').length} 项）` : '（关闭）'}</summary>
    <label className="mask-switch"><input type="checkbox" aria-label="启用条件过滤" checked={enabled} disabled={disabled} onChange={event => onEnabled(event.target.checked)} />只编辑符合条件的图格</label>
    <div className="mask-actions">
      <button disabled={disabled || rules.length === MASK_FIELDS.length} onClick={() => onRules([...rules, fresh(MASK_FIELDS.find(field => !rules.some(rule => rule.field === field.id)))])}>添加条件</button>
      <button disabled={disabled || !sample} onClick={() => { onRules(masksFromSample(sample.maskValues)); onEnabled(true); }}>按取样设定条件</button>
      <button disabled={disabled || !rules.length} onClick={() => onRules([])}>清空条件</button>
    </div>
    <div className="mask-rules" role="group" aria-label="匹配条件列表">
      {rules.map((rule, index) => {
        const field = MASK_FIELDS.find(item => item.id === rule.field);
        return <div className="mask-rule" key={rule.field}>
          <select aria-label={`条件${index + 1}字段`} value={rule.field} disabled={disabled} onChange={event => change(index, fresh(MASK_FIELDS.find(item => item.id === event.target.value)))}>
            {MASK_FIELDS.map(item => <option key={item.id} value={item.id} disabled={item.id !== rule.field && rules.some(other => other.field === item.id)}>{item.name}</option>)}
          </select>
          <select aria-label={`条件${index + 1}方式`} value={rule.mode} disabled={disabled} onChange={event => change(index, { ...rule, mode: event.target.value })}>
            {modesFor(field).map(mode => <option key={mode} value={mode}>{field.boolean && mode === 'match' ? '有' : field.boolean && mode === 'not' ? '没有' : MASK_MODES[mode]}</option>)}
          </select>
          {needsValue(rule) && <input type="number" aria-label={`条件${index + 1}数值`} min={field.min} max={field.max} step="1" value={Number.isFinite(rule.value) ? rule.value : ''} disabled={disabled} onChange={event => change(index, { ...rule, value: event.target.valueAsNumber })} />}
          <button aria-label={`删除条件${index + 1}`} disabled={disabled} onClick={() => onRules(rules.filter((_, i) => i !== index))}>×</button>
        </div>;
      })}
    </div>
    <p className="card-note">全部条件同时成立才会编辑。方块 ID −1 表示空格；液体 0 无、1 水、2 熔岩、3 蜂蜜、4 微光。坡形 0 完整、1 半砖、2–5 四向削角。</p>
    <p className="card-note">画笔、橡皮和选区填充均受条件限制。轨迹预览显示全部候选格，提交时按条件筛选。设好来源条件和目标材料，再填充选区即可匹配替换；复制、模板和粘贴不使用这些条件。</p>
    <output className="mask-state" aria-label="过滤状态">{!enabled ? '条件过滤已关闭' : !validMasks(rules) ? '条件数值无效，请填写范围内的整数。' : !rules.some(rule => rule.mode !== 'off') ? '尚无有效条件，将编辑全部目标图格。' : `${rules.filter(rule => rule.mode !== 'off').length} 项条件已启用`}</output>
  </details>;
}
