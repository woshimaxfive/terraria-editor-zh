// SPDX-License-Identifier: MS-PL
// TEdit contributors. Timed spray adaptation; see vendor/tedit-editing-rules/.
import { brushLine, EditError, MAX_STROKE_TILES } from './brush.js';
import { containsCell } from './selection.js';
import { createOrderedBrushStamp } from './orderedBrushStamp.js';

const MAX_SAMPLING_WORK = 1_000_000;
const randomIndex = (min, max) => min + Math.floor(Math.random() * (max - min));

// Geometry is drafted locally. The caller commits the final cells through the
// existing paint/erase transaction, so cancellation never writes partial results.
export class SprayStroke {
  constructor(world, settings, selection = null, { now = () => performance.now(), randomInt = randomIndex } = {}) {
    this.density = settings.sprayDensity ?? 15;
    this.interval = settings.sprayTickMs ?? 100;
    if (!Number.isInteger(this.density) || this.density < 1 || this.density > 100 ||
        !Number.isInteger(this.interval) || this.interval < 10 || this.interval > 100) throw new EditError('喷枪参数无效，密度须为 1–100%，间隔须为 10–100 毫秒。');
    this.stamp = createOrderedBrushStamp(settings);
    if (this.stamp.issue) throw new EditError(this.stamp.issue);
    this.world = world; this.selection = selection;
    this.now = now; this.randomInt = randomInt;
    this.cells = new Set(); this.interior = new Set(); this.solid = new Set();
    this.mode = 'spray'; this.hollow = null;
    this.previous = null; this.started = null; this.lastTick = 0; this.work = 0;
    this.inputStart = null; this.inputEnd = null;
  }

  consume(amount) {
    this.work += amount;
    if (this.work > MAX_SAMPLING_WORK) throw new EditError('本笔喷绘采样过多，请缩短每笔时间或降低密度；当前笔画已取消。');
  }

  add(point) {
    const time = this.now();
    if (!Number.isFinite(time) || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) throw new EditError('喷枪位置或时间无效，当前笔画已取消。');
    this.inputStart ??= point; this.inputEnd = point;
    if (this.started === null) {
      this.started = time; this.previous = point; this.spray(point); return;
    }
    const elapsed = Math.trunc(time - this.started);
    if (elapsed < this.lastTick) throw new EditError('喷枪时间无效，当前笔画已取消。');
    const count = Math.trunc((elapsed - this.lastTick) / this.interval);
    if (count <= 0) return;
    this.consume(count + Math.max(Math.abs(point.x - this.previous.x), Math.abs(point.y - this.previous.y)) + 1);
    const line = [...brushLine(this.previous, point)];
    for (let i = 0; i < count; i++) {
      const t = Math.fround((i + 1) / (count + 1));
      const index = Math.min(Math.trunc(Math.fround(t * line.length)), line.length - 1);
      this.spray(line[index]);
    }
    this.lastTick += count * this.interval;
    this.previous = point;
  }

  spray(center) {
    const points = this.stamp.points, total = points.length / 2;
    const count = Math.max(1, Math.trunc(total * this.density / 100));
    this.consume(count);
    const order = Int32Array.from({ length: total }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = this.randomInt(i, total);
      if (!Number.isInteger(j) || j < i || j >= total) throw new EditError('喷枪采样无效，当前笔画已取消。');
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < count; i++) {
      const offset = order[i] * 2, x = center.x + points[offset], y = center.y + points[offset + 1];
      if (x < 0 || y < 0 || x >= this.world.width || y >= this.world.height || !containsCell(this.selection, x, y)) continue;
      this.cells.add(x * this.world.height + y);
      if (this.cells.size > MAX_STROKE_TILES) throw new EditError('单笔最多修改 10000 格，请分段绘制。');
    }
  }
}
