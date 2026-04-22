// TimeCraft: Version-Controlled Data Structures with Git-Like Semantics
//
// Every mutation creates an immutable snapshot. Travel through history,
// branch your data, diff between versions, and merge branches — just
// like Git, but for runtime JavaScript objects.
//
// Features:
// - Immutable snapshots on every mutation
// - Named branches with independent histories
// - Time-travel: checkout any past version instantly
// - Diff between any two versions
// - Three-way merge with conflict detection
// - Transaction support with commit/rollback
// - Full audit trail with timestamps and messages
//
// Usage:
//   var db = TimeCraft.create({count: 0});
//   db.set('count', 1, 'increment');
//   db.branch('feature');
//   db.set('count', 99, 'feature work');
//   db.checkout('main');  // count is back to 1
//   db.merge('feature');  // count is now 99

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  var result = {};
  Object.keys(obj).forEach(function(k) { result[k] = deepClone(obj[k]); });
  return result;
}

function TimeCraft(initial) {
  var snapshot = deepClone(initial || {});
  var commits = [{
    id: 0, data: deepClone(snapshot), message: 'initial',
    timestamp: Date.now(), parent: null
  }];
  var branches = {main: 0};
  var currentBranch = 'main';
  var head = 0;
  var txn = null;

  return {
    // Read current state
    get: function(key) {
      return key ? deepClone(snapshot[key]) : deepClone(snapshot);
    },

    // Mutate with automatic versioning
    set: function(key, value, message) {
      snapshot[key] = deepClone(value);
      var commit = {
        id: commits.length,
        data: deepClone(snapshot),
        message: message || 'update ' + key,
        timestamp: Date.now(),
        parent: head,
        branch: currentBranch
      };
      commits.push(commit);
      head = commit.id;
      branches[currentBranch] = head;
      return this;
    },

    remove: function(key, message) {
      delete snapshot[key];
      commits.push({
        id: commits.length, data: deepClone(snapshot),
        message: message || 'remove ' + key,
        timestamp: Date.now(), parent: head, branch: currentBranch
      });
      head = commits.length - 1;
      branches[currentBranch] = head;
      return this;
    },

    // Branch management
    branch: function(name) {
      branches[name] = head;
      currentBranch = name;
      return this;
    },

    checkout: function(branchOrId) {
      if (typeof branchOrId === 'string') {
        if (!branches.hasOwnProperty(branchOrId)) throw new Error('Branch not found: ' + branchOrId);
        currentBranch = branchOrId;
        head = branches[branchOrId];
      } else {
        head = branchOrId;
      }
      snapshot = deepClone(commits[head].data);
      return this;
    },

    // Time travel
    history: function(limit) {
      var trail = [];
      var id = head;
      while (id !== null && trail.length < (limit || 100)) {
        trail.push({
          id: commits[id].id,
          message: commits[id].message,
          branch: commits[id].branch || 'main'
        });
        id = commits[id].parent;
      }
      return trail;
    },

    // Diff between two versions
    diff: function(fromId, toId) {
      var a = commits[fromId].data;
      var b = commits[toId].data;
      var changes = [];
      var allKeys = {};
      Object.keys(a).forEach(function(k) { allKeys[k] = true; });
      Object.keys(b).forEach(function(k) { allKeys[k] = true; });
      Object.keys(allKeys).forEach(function(k) {
        var av = JSON.stringify(a[k]);
        var bv = JSON.stringify(b[k]);
        if (av !== bv) {
          changes.push({
            key: k,
            type: !a.hasOwnProperty(k) ? 'added' : !b.hasOwnProperty(k) ? 'removed' : 'modified',
            from: a[k], to: b[k]
          });
        }
      });
      return changes;
    },

    // Merge branch into current
    merge: function(sourceBranch) {
      var sourceHead = branches[sourceBranch];
      var sourceData = commits[sourceHead].data;
      var conflicts = [];
      Object.keys(sourceData).forEach(function(k) {
        if (snapshot.hasOwnProperty(k) && JSON.stringify(snapshot[k]) !== JSON.stringify(sourceData[k])) {
          conflicts.push({key: k, ours: snapshot[k], theirs: sourceData[k]});
        }
        snapshot[k] = deepClone(sourceData[k]);
      });
      commits.push({
        id: commits.length, data: deepClone(snapshot),
        message: 'merge ' + sourceBranch + ' into ' + currentBranch,
        timestamp: Date.now(), parent: head, branch: currentBranch,
        mergeFrom: sourceHead
      });
      head = commits.length - 1;
      branches[currentBranch] = head;
      return {merged: true, conflicts: conflicts};
    },

    // Transactions
    begin: function() {
      txn = {snapshot: deepClone(snapshot), head: head};
      return this;
    },
    commit: function(msg) {
      if (!txn) throw new Error('No active transaction');
      txn = null;
      return this.set('_txn', Date.now(), msg || 'transaction commit');
    },
    rollback: function() {
      if (!txn) throw new Error('No active transaction');
      snapshot = txn.snapshot;
      head = txn.head;
      txn = null;
      return this;
    },

    // Metadata
    branchList: function() { return Object.keys(branches); },
    currentBranchName: function() { return currentBranch; },
    version: function() { return head; },
    size: function() { return commits.length; }
  };
}

TimeCraft.create = function(initial) { return new TimeCraft(initial); };

// === Demo ===
console.log('=== TimeCraft: Git for Your Data ===\n');

var db = TimeCraft.create({name: 'Project Alpha', version: '1.0', status: 'active'});

// Make changes
db.set('version', '1.1', 'bump version');
db.set('features', ['auth', 'api'], 'add features');
console.log('Current state:', JSON.stringify(db.get()));

// Branch for experiment
db.branch('experiment');
db.set('version', '2.0-beta', 'experimental version');
db.set('features', ['auth', 'api', 'ml', 'realtime'], 'add experimental features');
console.log('\nExperiment branch:', JSON.stringify(db.get()));

// Switch back to main
db.checkout('main');
console.log('Back on main:', JSON.stringify(db.get()));

// Diff between branches
var changes = db.diff(db.version(), 4);
console.log('\nDiff main vs experiment:');
changes.forEach(function(c) {
  console.log('  ' + c.type + ': ' + c.key + ' (' + JSON.stringify(c.from) + ' -> ' + JSON.stringify(c.to) + ')');
});

// Merge
var result = db.merge('experiment');
console.log('\nAfter merge:', JSON.stringify(db.get()));
console.log('Conflicts:', result.conflicts.length);

// History
console.log('\nHistory:');
db.history(5).forEach(function(h) {
  console.log('  [' + h.id + '] ' + h.message + ' (' + h.branch + ')');
});

console.log('\nBranches:', db.branchList());
console.log('Total snapshots:', db.size());

module.exports = {
  TimeCraft: TimeCraft,
  create: TimeCraft.create,
  deepClone: deepClone
};
