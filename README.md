# ff: Concise, Powerful Asynchronous Flow Control in JavaScript

***ff* simplifies the most common use cases for series, parallel, and
promise utilities.** It was built because existing async libraries are
too verbose and don't handle errors properly. Don't let your errors go
unhandled. :-)

#### Installation

- **Node.JS: `npm install ff`**
- Browsers: Add `lib/ff.js` to your HTML page.

## Table of Contents

- [Quick Examples](#quick-examples)
- [API Documentation](#api-documentation)
- [Advanced Usage](#advanced-usage)
- [Compared to Other Async Libraries](#compared-to-other-async-libraries)

## Quick Examples

Here's a brief example that shows both series and parallel steps:

```javascript
var f = ff(this, function () {
    fs.readFile("1.txt", f());
    fs.readFile("2.txt", f());
}, function (fileA, fileB) {
    concatFiles(fileA, fileB, f());
}, function (result) {
    f(result.toUpperCase());
}).cb(cb);
```

A typical Express web handler looks like this. (Note that even if an
exception gets thrown during one of these handlers, it gets passed
down the chain as an error.)

```javascript
function (req, res, next) {
    var f = ff(function() {
        authenticateUser(req, f());
    }, function (user) {
        f(user); // pass the user along synchronously
        user.getFriends(f());
    }, function (user, friends) {
        res.json({ user: user, friends: friends });
    }).error(next); // call next() *only* on error
}
```

---

# API Documentation

## First, call `ff` and save its return value (as `f`, perhaps).

#### `var f = ff([context], stepFunctions... )`
    
The ``ff`` function takes a context and any number of
functions, which we call "steps". Each step is run one at a time. Use
`ff`'s return value (often called `f`) to create callbacks for any
async functions used in each step.

## Second, use the returned `f` object inside each step function.

**Within your step functions, pass `f()` as the callback parameter to
any async function.** This reserves a "slot" in the next step's
function arguments. For instance:

```javascript
	fs.readFile("1.txt", f()); // fs.readFile will use that as a callback.
```

Most often, that's all you'll need, but there are other ways to pass
data:

```javascript
	f(data); // pass data synchronously to the next function
	fs.exists("1.txt", f.slotNoError()); // fs.exists doesn't pass (err, result), just (result)
	emitter.once("close", f.wait()); // just wait for the "close" event
```

### All Methods on `f`:

#### `f()`

Calling `f()` reserves a slot in the next step's function arguments,
and returns a callback that you should pass into an async function.
The async function should be called with an error as in `callback(err,
result)`. This is an alias for `f.slot()`.

#### `f(arg1, arg2...)`

If you call `f` with arguments, those arguments will be passed into
the next step. This can be useful when you need to pass along a value
directly to the next function synchronously. This is an alias for
`f.pass()`.

#### `f.wait()`

Sometimes you don't want to pass any arguments to the next function,
but you just want to wait until an async call completes successfully.
This behaves exactly like `f()` and `f.slot()`, handling errors, but
no arguments are passed to the next step.

#### `f.slotNoError()`

This is like `f()` and `f.slot()`, except that the resulting callback
must *not* accept an error, as in `callback(result)`. Node's
`fs.exists` doesn't return an error, for instance, and so you must use
`f.slotNoError()` for its callback instead. (If you had used
`f.slot()`, it would have thought `fs.exists` had passed an *error* as
the first argument.

#### `f.waitNoError()`

See `f.slotNoError()`. Like `f.wait()`, this does not pass any
arguments to the next step.

#### `f.group()`

This reserves exactly one slot in the next step, and returns a group
object that has all of the above methods. Anything you slot or pass
into the group gets passed into the next function's argument list *as
an array*. (See the Groups example.)

## Finally, remember to handle the result! (`.cb`, `.error`, `.success`)

After you've called `ff()` with your steps, you'll want to handle the
final result that gets passed down the end of the function. We often
do this like so:

```javascript
var f = ff(
   // steps here...
).cb(cb);
```

That final callback will be passed arguments node-style: `cb(err,
results...)`. (The number of arguments after `err` depends on how many
slots you've passed from the last function in the chain.) This lets
you use ff within any part of your code without expecting any other
function to know that `ff` exists in your own code.

There are three ways you can handle the final result (you can mix and
match):

#### `f.cb( function (err, results...) { } )`

A `.cb()` result handler will *always* be called, whether or not an
error occurred. An error object will be passed first (null if there
was no error.)

#### `f.success( function (results...) {} )`

A `.success()` handler will *only* be called if no error occur ed.
Additionally, an error object will *not* be passed. Only results.

#### `f.error( function (err) {} )`

A `.error()` result handler will *only* be called if an error occured.
In this case, `err` will never be null. (If you're using Express,
often we use `.error(next)` to propagate whenever we didn't reach a
call to `res.send()`.)

**Always remember to add either a `.cb()` or `.success()` handler
after your `ff()` call, so that errors propagate!**

### Error Handling

If any function throws an exception, or an error gets passed to one of
the callbacks (as in `callback(err, result)`), the error will get
passed down to the next function that can handle the error. In most
cases, this is the `.cb(cb)` function you added at the end. This is an
important feature that a lot of async libraries don't handle properly,
and it ensures that if you specify a `.cb()` or `.error()`, you'll
always pass back a final callback with an error or a result.

---

# Advanced Usage

### Groups (for processing arrays)

The `f.group()` method reserves exactly one slot in the next step and
returns an object just like `f`. Anything you slot or pass into the
group gets passed into the next function's argument list *as an
array*. This is useful for processing arrays of items. Here's an example:

```javascript
var allMyFiles = ["one.txt", "two.txt", "three.txt"];

var f = ff(function() {
    var group = f.group();
    allMyFiles.forEach(function (file) {
        fs.readFile(file, group());
    });
}, function (allFiles) {
    // allFiles now consists of 3 items (the contents of each file).
    
    // If any call had returned an err, this function would not be
    // called, and the error would have been passed down to `cb`.
}).cb(cb);
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
f.success(one);
f.success(two);
f.cb(three);
```

Error handling is actually quite simple: If an error occurs in any
step, it gets passed down, skipping over any `.success` handlers.

---

# Compared to Other Async Libraries

Let's say you want to do something simple: Read two files, and
callback whether or not the two files are equal. And we want any
errors to be propagated up to the caller.

### Using ff

```javascript
function compareFiles(pathA, pathB, cb) {
    var f = ff(function () {
        fs.readFile(pathA, f());
        fs.readFile(pathB, f());
    }, function (fileA, fileB) {
        f(fileA == fileB); // pass the result to cb
    }).cb(cb);
}
```
    
### Using js.io's lib.Callback (promises)

```javascript
function compareFiles(pathA, pathB, cb) {
    var callback = new lib.Callback();
    fs.readFile(pathA, callback.chain());
    fs.readFile(pathB, callback.chain());
    callback.run(function (chains) {
        var err = chains[0][0] || chains[1][0];
        if (err) {
            cb(err);
        } else {
            cb(null, chains[0][1] == chains[1][1]);
        }
    });
}
```
    
### Using async

```javascript
function compareFiles(pathA, pathB, cb) {
    async.parallel({
        fileA: function (callback) {
            fs.readFile(pathA, callback);
        },
        fileB: function (callback) {
            fs.readFile(pathB, callback);
        }
    }, function (err, results) {
        if (err) {
            cb(err);
        } else {
            cb(null, results.fileA == results.fileB);
        }
    });
}
``` 

### Using Basil's common.parallel

```javascript
function compareFiles(pathA, pathB, cb) {
    var wait = common.parallel(function(results) {
        var err = results.err1 || results.err2;
        if (err) {
            cb(err);
        } else {
            cb(null, results.fileA == results.fileB);
        }
    });
    
    fs.readFile(pathA, wait('err1', 'fileA'));
    fs.readFile(pathB, wait('err2', 'fileB'));
}
```

## Acknowledgements

This code was originally based on
[Tim Caswell](mailto:tim@creationix.com)'s sketch of a
[reimagined Step](https://gist.github.com/1524578#comments) library, 
