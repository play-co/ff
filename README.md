# <img src="http://f.cl.ly/items/3K113g321o0n0W0Y0Z33/Fast%20Forward%20Icon%20in%2032x32%20px.png" width=25 height=25> ff: Concise, Powerful Asynchronous JavaScript Flow Control

***ff* simplifies the most common use cases for series, parallel, and
promise utilities.** 

# Installation

	$ npm install ff

In the browser, simply add a script tag pointing to `lib/ff.js` in your HTML page.

### Table of Contents

- [Quick Start](#quick-start)
- **[API Documentation](#api-documentation)**
- [Advanced Usage](#advanced-usage)
- [Promise API](#promise-api-deferreds)
- **[Quick Reference & Cheat Sheet](#quick-reference--cheat-sheet)**

# Quick Start

`ff()` accepts a list of functions to be run in sequential order, and returns an object 
that can be used to manage the flow of data between these functions. You may also pass in a 
context object as the first parameter, which FF will bind to all function calls.

```javascript
var ff = require("ff");

var f = ff(this,
	function () {
		fs.readFile("1.txt", f.slot());
		fs.readFile("2.txt", f.slot());
	},
	function (fileA, fileB) {
		this.sortFileContents(fileA, fileB, f.slot());
	},
	function (result) {
		f.pass(result.toUpperCase());
	}
).cb(nextFn);
```

FF is also [Promises/A+](http://promises-aplus.github.com/promises-spec/) compliant. For more information about using FF promises, see [below](#promise-api-deferreds).

```javascript
var f = ff(this,
	function () {
		fs.readFile("1.txt", f.slot());
	}
);

f.then(
	function onFulfilled(data) { }, 
	function onRejected(err) { }
);
```

A typical Express web handler looks like this. (Note that even if an
exception gets thrown during one of these handlers, the .onError()
handler will be called.

```javascript
function (req, res, next) {
	var f = ff(
		function() {
			authenticateUser(req, f.slot());
		},
		function (user) {
			f.pass(user); // pass the user along synchronously
			user.getFriends(f.slot());
		},
		function (user, friends) {
			res.json({ user: user, friends: friends });
		}
	).onError(next); // call next() *only* on error
}
```

---

# API Documentation

### First, call `ff` and save its return value (as `f`, perhaps).

```javascript
var f = ff([context], stepFunctions, ... )
```

The `ff()` function takes a context and any number of
functions, which we call "steps". Each step is run one at a time. Use
`ff`'s return value (often called `f`) to manage the flow of data between 
functions.

### Second, use the returned `f` object inside each step function.

Within your step functions, pass `f.slot()` as the callback parameter to
any async function. This reserves a "slot" in the next step's
function arguments. For instance:

```javascript
fs.readFile("1.txt", f.slot()); // the file contents will be passed to the next function
```

Most often, that's all you'll need, but there are other ways to leverage 
FF to handle the flow of data.

```javascript
f.pass(data); // pass data synchronously to the next function
fs.exists("1.txt", f.slotPlain()); // fs.exists doesn't pass (err, result), just (result)
emitter.once("close", f.wait()); // just wait for the "close" event, don't pass any data
```

### All Methods on `f`:

#### `f.slot()` aliased as `f()`

Calling `f.slot()` reserves a slot in the next step's function arguments,
and returns a callback that you should pass into an async function.
The async function should be called with an error as in `callback(err,
result)`.

#### `f.pass(arg1, arg2...)` aliased as `f(arg1, arg2...)`

If you call `f.pass()`, the arguments will be passed into
the next step. This can be useful when you need to pass along a value
directly to the next function synchronously.

#### `f.wait()`

Sometimes you don't want to pass any arguments to the next function,
but you just want to wait until an async call completes successfully.
This behaves exactly like `f.slow()`, handling errors, but no data is 
passed to the next step.

#### `f.slotPlain()`

This is like `f.slot()`, except that the resulting callback must *not*
accept an error, as in `callback(result)`. Node's `fs.exists` doesn't
return an error, for instance, and so you must use `f.slotPlain()` for
its callback instead. (If you had used `f.slot()`, it would have
thought `fs.exists` had passed an *error* as the first argument.

#### `f.waitPlain()`

See `f.slotPlain()`. Like `f.wait()`, this does not pass any
arguments to the next step.

#### `f.slotMulti(n)`

Like `f.slot()`, except that the resulting callback will pass `n` arguments
to the next step instead of just one. For instance, calling `var cb =
f.slotMulti(2)` followed by `cb(err, rsp, body)` would pass both `rsp`
and `body` as two arguments to the next step.

#### `f.group()`

This reserves exactly one slot in the next step, and returns a group
object that has all of the above methods. Anything you slot or pass
into the group gets passed into the next function's argument list *as
an array*. (See the [Groups example](#advanced-usage).)

#### `f.succeed(successArgs...)`

This causes the chain of steps to end successfully (after you return
from the current function). The result handlers (`.onSuccess()` and
`.cb()`) will be called as soon as the current step returns. No other
steps will be executed afterward.

#### `f.fail(err)`

This causes the chain of steps to end as though the given error had
occurred (after you return from the current function). The result
handlers (`.onError()` and `.cb()`) will be called as soon as the
current step returns. No other steps will be executed afterward.

#### `f.next(fn)`

You can add additional steps after calling `ff()` using `f.next(fn)`.
Internally, we pass the arguments through this function initially.

#### `f.timeout(milliseconds)`

Set a timeout; if the `ff` chain of steps do not finish after this
many milliseconds, fail with a timeout Error. Works with both deferred
and normal `ff` steps.

### Finally, remember to handle the result! (`.cb`, `.onError`, `.onSuccess`)

After you've called `ff()` with your steps, you'll want to handle the
final result that gets passed down the end of the function. We often
do this like so:

```javascript
var f = ff(
   // steps here...
).cb(resultHandler);
```

That final callback will be passed arguments node-style: `cb(err,
results...)`. The number of arguments after `err` depends on how many
slots you passed from the last function in the chain.

There are three ways you can handle the final result (and you can mix and
match):

#### `f.cb( function (err, results...) { } )`

A `.cb()` result handler will *always* be called, whether or not an
error occurred. An error object will be passed first (null if there
was no error.)

#### `f.onSuccess( function (results...) {} )`

A `.onSuccess()` handler will *only* be called if no error occured.
Additionally, an error object will *not* be passed. Only results.

#### `f.onError( function (err) {} )`

A `.onError()` result handler will *only* be called if an error occured.
In this case, `err` will never be null. (If you're using Express,
often we use `.onError(next)` to propagate whenever we didn't reach a
call to `res.send()`.)

**Always remember to add one of these result handlers after your
`ff()` call, so that errors propagate!** You can add multiple result
handlers and they will each be called in the order in which they were registered.

### Error Handling

If any function throws an exception, or an error gets passed to one of
the callbacks (as in `callback(err, result)`), the error will be
propagated immediately to your result handlers (`.cb()` and
`.onError()`). If a result handler throws an exception, that exception
will bubble up into Node's `unhandledException` handler or the
browser's developer console.

---

# Advanced Usage

### Groups (for processing arrays)

The `f.group()` method reserves exactly one slot in the next step and
returns an object just like `f`. Anything you slot or pass into the
group gets passed into the next function's argument list *as an
array*. This is useful for processing arrays of items. Here's an example:

```javascript
var allMyFiles = ["one.txt", "two.txt", "three.txt"];

var f = ff(
	function () {
		var group = f.group();
		allMyFiles.forEach(function (file) {
			fs.readFile(file, group());
		});
	},
	function (allFiles) {
		// allFiles is an array of 3 items (the contents of each file).

		// If any call had returned an err, this function would not be
		// called, and the error would have been passed down to `cb`.
	}
).cb(nextFn);
```

### Implementation Details

The following are equivalent:

```javascript
var f = ff(this,
	one,
	two,
).cb(three);
```

```javascript
var f = ff(this);
f.next(one);
f.next(two);
f.cb(three);
```

Error handling is actually quite simple: If an error occurs in any
step, it gets passed down to the `cb` or `onError` handler, skipping over any `.next` handlers.

---

# Promise API (Deferreds)

`ff` can also be used as a promise library. If you are intersted in managing your own promises,
you can use the `defer` helper.

```javascript
var f = ff.defer();

// set callbacks:
f.then(
	function onFulfilled(result, restul2) { },
	function onError(err) { }
);

// now trigger the result (or rejection)
f(result, result2); // or f.fail(err);
```

To trigger success or failure:

```javascript
f(arg1, arg2...) // success
f.fail(err)      // failure
```

In addition to using `then` to attach completion handlers, you can also use the regular 
ff `.onSuccess()`, `.onError()`, and `.cb()` to do so.

And just like regular `ff`, you can pass functions into `ff.defer(...)`:

```javascript
var f = ff.defer(
	function(result, text) {
		// do something with result
	},
	function () {
		// ...etc...
	}
);

f.then(
	function onFulfilled(results) { },
	function onError(err) { };
);

// now fire the result into the first step!
f(result, "something else");
```

If you want to know more about how ff promises work, see the [Promises/A+ spec](http://promises-aplus.github.com/promises-spec/).

---
# Quick Reference / Cheat Sheet

The [API Documentation](#api-documentation) provides a much more thorough tutorial.

#### Control Flow API Summary

```javascript
// Create a chain of steps with the `ff` function:
var f = ff(context, 
	function () {
		// Within each method, use the `f` object.
		// Most common uses:
		f(arg1, arg2); // pass multiple arguments synchronously
		fs.readFile("file1.txt", f());      // use f() for async callbacks
		fs.readFile("file2.txt", f.wait()); // just wait for the result
	                                        // without putting it in args
										 
		// To process arrays, use groups:
		var group = f.group();
		allFiles.forEach(function (item) {   // use any `f` function on arrays
		    fs.readFile(item, group.slot()); // and the result gets stored as
		});                                  // an array in the next step
		
		// Less common uses for atypical functions
		fs.exists("file3.txt", f.slotPlain()); // fs.exists doesn't pass an error
		fs.exists("file4.txt", f.waitPlain()); // ditto, and I don't care if it fails
		var cb = f.slotMulti(2); // slot and pass two arguments to the next function
		                         // for example, cb(null, 1, 2);
		
		// Aborting the chain of steps early:
		f.succeed(result1, ...); // after this function, skip the other steps
		f.fail(err);             // after this function, fail with this error
		f.timeout(200);			 // abort if it doesn't finish before 200 milliseconds
	},
	function (arg1, arg2, file1, allFiles, file3Exists, multi1, multi2) {
		// Do something amazing here!
	}
).cb(nextFn); // <-- usually you'll have someone else handle a (err, result...) callback

// Add a timeout (which would result in a failure with a timeout Error
f.timeout(milliseconds);

// Don't forget all the result handler options (attach as many as you like!)
f.cb(function (err, args...) { }); // triggered on both success and error
f.onSuccess(function (args...) { }); // only on success
f.onError(function (err) { });       // only on error
```

#### Promise API Summary

```javascript
// Create a deferred
var f = ff.defer();

// Add result handlers:
f.then(
	function onFulfilled(arg1, ...) { },
	function onError(err) { };
);

// Trigger results: 
f(arg1, ...); // fulfill
f.fail(err);  // reject
```

---
# Acknowledgements

Made by [Marcus Cavanaugh](http://mcav.com/) and [Michael Henretty](http://twitter.com/mikehenrty).

This code was originally based on
[Tim Caswell](mailto:tim@creationix.com)'s sketch of a
[reimagined](https://gist.github.com/1524578) [Step](https://github.com/creationix/step) library.
