import { initialState, applyCommand } from '../lib/domain.mjs';
import { processUpdate } from '../lib/telegram.mjs';
export const transactions = [
  { actor: 'richard', type: 'sale', reference: 'S01', customer: 'Olivia Rose', project: 'A', description: 'One proud uncle and an emotional grandmother', amount: '1000', split: [50, 30, 20] },
  { actor: 'anastasia', type: 'sale', reference: 'S02', customer: 'Daniel King', project: 'B', description: 'University friends, dancing, and the stripping performance', amount: '2000', split: [0, 50, 50] },
  { actor: 'kevin', type: 'expense', reference: 'E01', description: 'Rented suit and fake pearl necklace for the relatives', amount: '120', category: 'Materials', allocation: 'A' },
  { actor: 'kevin', type: 'expense', reference: 'E02', description: 'Taxi for the grandmother; Kevin selected the wrong project', amount: '80', category: 'Travel', allocation: 'B' },
  { actor: 'kevin', type: 'expense', reference: 'E03', description: 'Monthly company website subscription', amount: '100', category: 'Other', allocation: 'overhead' },
  { actor: 'jean', type: 'sale', reference: 'S03', customer: 'Emma Stonebridge', project: 'A', description: 'Premium relatives, including an uncle presented as a surgeon', amount: '1500', split: [40, 40, 20] },
  { actor: 'richard', type: 'sale', reference: 'S04', customer: 'Lucas Green', project: 'B', description: 'Small group of loud university friends', amount: '800', split: [25, 25, 50] },
  { actor: 'richard', type: 'sale', reference: 'S05', customer: 'Mia Brooks', project: 'B', description: 'Extra guests and an embarrassing speech', amount: '600', split: [100, 0, 0] },
  { actor: 'kevin', type: 'expense', reference: 'E04', description: 'Replacement costumes after an enthusiastic dance performance', amount: '250', category: 'Materials', allocation: 'B' },
  { actor: 'kevin', type: 'expense', reference: 'E05', description: 'Minibus for university friends; Kevin selected the wrong project again', amount: '90', category: 'Travel', allocation: 'A' },
  { actor: 'kevin', type: 'expense', reference: 'E06', description: 'Company telephone subscription', amount: '60', category: 'Other', allocation: 'overhead' },
  { actor: 'kevin', type: 'expense', reference: 'E07', description: 'Emergency replacement clothing; project allocation still needs checking', amount: '140', category: 'Materials', allocation: 'A' }
];
export const fixture = ref => transactions.find(t => t.reference === ref);
export const submit = (s, ref) => applyCommand(s, fixture(ref).actor, { action: 'submit', transaction: fixture(ref) });
export const approve = (s, reference, decision) => applyCommand(s, 'svetlana', { action: 'approve', reference, ...decision });
export function test1Pending() {
  let s = initialState();
  s = processUpdate(s, { update_id: 1, message: { from: { id: 12345 }, chat: { id: 12345, type: 'private' }, text: '/start' } });
  s = applyCommand(s, 'svetlana', { action: 'link', userId: '12345', employeeId: 'richard' });
  s = processUpdate(s, { update_id: 2, message: { from: { id: 12345 }, chat: { id: 12345, type: 'private' }, text: '/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50/30/20' } });
  s = applyCommand(s, 'svetlana', { action: 'link', userId: '12345', employeeId: 'kevin' });
  s = processUpdate(s, { update_id: 3, message: { from: { id: 12345 }, chat: { id: 12345, type: 'private' }, text: '/expense E01 | Rented suit and fake pearl necklace for the relatives | 120 | Materials | A' } });
  for (const ref of ['S02', 'E02', 'E03']) s = submit(s, ref);
  return s;
}
export function test1Complete() {
  let s = test1Pending();
  for (const [ref, decision] of [['S01', { split: [50, 30, 20] }], ['S02', { split: [20, 40, 40] }], ['E01', { allocation: 'A' }], ['E02', { allocation: 'A' }]]) s = approve(s, ref, decision);
  return s;
}
export function test2Complete() {
  let s = test1Complete();
  for (const ref of ['S03', 'S04', 'S05', 'E04', 'E05', 'E06', 'E07']) s = submit(s, ref);
  s = applyCommand(s, 'svetlana', { action: 'link', userId: '12345', employeeId: 'jean' });
  s = approve(s, 'S03', { split: [20, 30, 50] });
  s = approve(s, 'S04', { split: [25, 25, 50] });
  s = applyCommand(s, 'svetlana', { action: 'link', userId: '12345', employeeId: 'kevin' });
  s = approve(s, 'E04', { allocation: 'B' });
  s = approve(s, 'E05', { allocation: 'B' });
  return s;
}
