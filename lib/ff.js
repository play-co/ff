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

// This is ff, by Marcus Cavanaugh and Michael Henretty.
// It was inspired by TwoStep, by Tim Caswell,
// which was in turn inspired by Will Conant's flow-js.

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

function UncaughtError(e) {
	this.name = "UncaughtError";
	this.message = "Uncaught Error";
	this.exception = e;
}
UncaughtError.prototype = new Error();

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
			group.args[index + i] = values[i];
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
	var subgroup = new Group(function (err) {
		if (err) return group.error(err);
		var data = slice.call(arguments, 1);
		group.args[index] = data;
		if (--group.left === 0) group.done();
	}, function () {
		group.left++;
	});
	
	return constructFFReturnObject(subgroup);
};

Group.prototype.makeGroup = Group.prototype.group; // alias

// global group
function SuperGroup(context) {
	this.currentGroup = null;
	this.context = context;
	this.steps = [];
}

for (var method in Group.prototype) if (Group.prototype.hasOwnProperty(method)) {
	SuperGroup.prototype[method] = (
		function (method) {
			return function () {
				if (this.currentGroup) {
					return this.currentGroup[method].apply(this.currentGroup, arguments);
				}
			};
		})(method);
}
/**
 * Call this function regardless of whether or not an error has
 * propagated down the chain. You'll usually want to call this at the
 * end of your chain.
 */
SuperGroup.prototype.cb = function (cb) {
	this.steps.push(cb);
	return this;
}

/**
 * If and only if there was no error (this far in the chain), call cb
 * WITHOUT passing any error at all. Again, error won't be null, it'll
 * not be passed at all. Your function should only accept the success
 * arguments.
 */
SuperGroup.prototype.success = function (cb) {
	this.steps.push(function(err) {
		if (err) {
			throw err;
		} else {
			cb.apply(this, slice.call(arguments, 1));
		}
	});
	return this;
}

/**
 * If and only if there was an error, call cb with the
 * error as an argument.
 */
SuperGroup.prototype.error = function (cb) {
	this.steps.push(function(err) {
		err && cb.apply(this, arguments);
	});
	return this;
}


// Stepper function
SuperGroup.prototype._next = function() {
	var step = this.steps.shift();
	if (!step) {
		arguments[0] && ff.onerror.apply(null, arguments);
		return;
	}
	var group = new Group(this._next.bind(this));
	try {
		// make sure next function isnt applied
		// until current function has completed
		group.left++;
		this.currentGroup = group;
		step.apply(this.context || group, arguments);
		group.left--;
	} catch (e) {
		group.left--;
		if (e instanceof DoneError) {
			return; // don't call anything else.
		} else if (e instanceof UncaughtError) {
			throw e.exception;
		}
		group.error(e);
	}
	if (group.left === 0) group.done();
}

function ff() {
	var args = slice.call(arguments);
	// context is the optional first argument
	var context = null;
	if (typeof arguments[0] !== "function") {
		context = args.shift();
	}
	
	var superGroup = new SuperGroup(context);
	
	args.forEach(function (fn) {
		if (fn._ffMethod) { // backwards-compat
			superGroup[fn._ffMethod](fn);
		} else {
			superGroup.success(fn);
		}
	});

	// execute steps in next tick
	setTimeout(function(){ superGroup._next(); }, 0);	
	return constructFFReturnObject(superGroup);
}

// make the actual object to be returned (the "f" object)
function constructFFReturnObject(group) {
	var f = function () {
		if (arguments.length == 0) {
			return group.slot.apply(group, arguments);
		} else {
			return group.pass.apply(group, arguments);
		}
	};
	for (var method in group) {
		f[method] = (function(method) {
			return function() {
				return group[method].apply(group, arguments);
			};
		})(method);
	}
	return f;
}

ff.onerror = function(err) {
	throw new UncaughtError(err);
}

// backwards-compatibility (disregard):

ff.cb = function (fn) {
	fn._ffMethod = 'cb';
	return fn;
}

ff.error = function (fn) {
	fn._ffMethod = 'error';
	return fn;
}

ff.success = function (fn) {
	fn._ffMethod = 'success';
	return fn;
}

