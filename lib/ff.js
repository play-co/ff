/*
 Copyright (c) 2011 Tim Caswell <tim@creationix.com>
 Copyright (c) 2012 Marcus Cavanaugh <m@mcav.com>
 Copyright (c) 2012 Michael Henretty <michael.henretty@gmail.com>

 MIT License

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

// Inspired by http://github.com/willconant/flow-js, but reimplemented and
// modified to fit my taste and the node.JS error handling system.

// using TwoStep via https://gist.github.com/1524578#comments - mcav


if (typeof module !== 'undefined') {
	module.exports = ff;
}

var slice = Array.prototype.slice;

// custom error used to break out of step
function DoneError() {
	this.name = "DoneError";
	this.message = "Group done";
}
DoneError.prototype = new Error();

function Group(callback, firstSlotCallback) {
	this.args = [null];
	this.left = 0;
	this.callback = callback;
	this.isDone = false;
	this.firstSlotCallback = firstSlotCallback; // mcav
}

Group.prototype.done = function done() {
	if (this.isDone) return;
	this.isDone = true;
	this.callback.apply(null, this.args);
};

// added by mcav -- break out of the ff
Group.prototype.exit = function exit() {
	if (this.isDone) return;
	this.isDone = true;
	throw new DoneError();
};

Group.prototype.error = function error(err) {
	if (this.isDone) return;
	this.isDone = true;
	var callback = this.callback;
	callback(err);
};

// Simple utility for passing a sync value to the next step.
Group.prototype.pass = function pass() {
	var values = slice.call(arguments);
	for (var i = 0, l = values.length; i < l; i++) {
		this.args.push(values[i]);
	}
};

// Register a slot in the next step and return a callback
Group.prototype.slot = function slot(argLength) {
	this.debug && console.log("slotting", this.left);
	if (!argLength) argLength = 1;
	var group = this;
	var index = group.args.length;
	group.args.length += argLength;
	group.left++;
	if (this.firstSlotCallback) { // mcav
		this.firstSlotCallback();
		this.firstSlotCallback = null;
	}
	return function (err) {
		group.debug && console.log("slot DONE", group.left);
		if (err) return group.error(err);
		var values = slice.call(arguments, 1);
		for (var i = 0; i < argLength; i++) {
			group.args[index + i] = values[i] || null;
		}
		if (--group.left === 0) group.done();
	};
};

// Register a slot in the next function which includes first param
Group.prototype.slotNoError = function slotNoError(argLength) {
	this.debug && console.log("slotting (no error)", this.left);
	var group = this;
	var slot = group.slot(argLength);
	return function () {
		group.debug && console.log("slot DONE (no error)", group.left);
		slot.apply(group, [null].concat(slice.call(arguments)));
	}
};

// Block on this callback, but dont slot data
Group.prototype.wait = function wait() {
	this.debug && console.log("waiting", this.left);
	var group = this;
	group.left++;
	if (this.firstSlotCallback) { // mcav
		this.firstSlotCallback();
		this.firstSlotCallback = null;
	}
	return function (err, data) {
		group.debug && console.log("wait DONE", group.left);
		if (err) return group.error(err);
		if (--group.left === 0) group.done();
	};
};

// Wait, but don't forward error
Group.prototype.waitNoError = function waitNoError() {
	this.debug && console.log("waiting (no error)", this.left);
	var group = this;
	var wait = this.wait();
	return function () {
		group.debug && console.log("wait DONE (no error)", group.left);
		wait.apply(group, [null].concat(slice.call(arguments)));
	}
};

// Creates a nested group where several callbacks go into a single array.
Group.prototype.group = function group() {
	var group = this;
	var index = this.args.length++;
	return new Group(function (err) {
		if (err) return group.error(err);
		var data = slice.call(arguments, 1);
		group.args[index] = data;
		if (--group.left === 0) group.done();
	}, function () {
		group.left++;
	});
};
Group.prototype.makeGroup = Group.prototype.group; // alias

// global group
function SuperGroup() {
	this.currentGroup = null;
}
SuperGroup.prototype.done = function () {
	if (this.currentGroup) {
		return this.currentGroup.done.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.error = function () {
	if (this.currentGroup) {
		return this.currentGroup.error.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.exit = function () {
	if (this.currentGroup) {
		return this.currentGroup.exit.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.pass = function () {
	if (this.currentGroup) {
		return this.currentGroup.pass.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.slot = function () {
	if (this.currentGroup) {
		return this.currentGroup.slot.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.slotNoError = function () {
	if (this.currentGroup) {
		return this.currentGroup.slotNoError.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.wait = function () {
	if (this.currentGroup) {
		return this.currentGroup.wait.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.waitNoError = function () {
	if (this.currentGroup) {
		return this.currentGroup.waitNoError.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.group = function () {
	if (this.currentGroup) {
		return this.currentGroup.group.apply(this.currentGroup, arguments);
	}
};
SuperGroup.prototype.makeGroup = SuperGroup.prototype.group; // alias


// Stepper function
function exec(steps, superGroup, context) {
	var pos = 0;
	next();
	function next() {
		var step = steps[pos++];
		if (!step) {
			arguments[0] && ff.onerror.apply(null, arguments);
			return;
		}
		var group = new Group(next);
		try {
			// make sure next function isnt applied
			// until current function has completed
			group.left++;
			superGroup.currentGroup = group;
			step.apply(context ? context : group, arguments);
			group.left--;
		} catch (e) {
			group.left--;
			if (e instanceof DoneError) {
				return; // don't call anything else.
			}
			group.error(e); // try-catch added by mcav
		}
		if (group.left === 0) group.done();
	}
}

// Execute steps immediately
function ff() {
	function autoHandleError(fn) {
		if (!fn) { return null; }
		if (fn.includeError) { return fn; }
		return function (err) {
			if (err) { return this.error(err); }
			var args = slice.call(arguments, 1);
			fn.apply(this, args);
		};
	}
	var args = slice.call(arguments);
	var superGroup = new SuperGroup();
	var context;
	if (typeof arguments[0] !== "function") {
		context = args.shift();
	}
	setTimeout(function () {
		exec.call(superGroup, args.map(autoHandleError), superGroup, context);
	}, 0);
	return superGroup;
}

// Expose just for fun and extensibility
ff.Group = Group;

ff.onerror = function(err) {
	throw err;
}

ff.cb = function (fn) {
	if (!fn) { return null; }
	var wrapped = function () {
		fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

ff.error = function (fn) {
	if (!fn) { return null; }
	var wrapped = function (err) {
		err && fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

ff.success = function (fn) {
	if (!fn) { return null; }
	var wrapped = function (err) {
		!err && fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

