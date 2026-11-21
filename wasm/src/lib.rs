//! Plotsy WASM 数值核心。
//!
//! 插件无依赖、无 wasm-bindgen。JS 侧把表达式编译成 f64 字节码，
//! 一次性批量计算整条曲线的采样点，避免每像素进入 JS 闭包。

use std::alloc::{alloc, dealloc, Layout};
use std::slice;

const OP_END: i32 = 0;
const OP_PUSH: i32 = 1;
const OP_X: i32 = 2;
const OP_Y: i32 = 3;

const OP_ADD: i32 = 10;
const OP_SUB: i32 = 11;
const OP_MUL: i32 = 12;
const OP_DIV: i32 = 13;
const OP_POW: i32 = 14;
const OP_MOD: i32 = 15;

const OP_NEG: i32 = 20;
const OP_ABS: i32 = 21;
const OP_SIGN: i32 = 22;
const OP_FLOOR: i32 = 23;
const OP_CEIL: i32 = 24;
const OP_ROUND: i32 = 25;
const OP_SQRT: i32 = 26;
const OP_CBRT: i32 = 27;

const OP_SIN: i32 = 30;
const OP_COS: i32 = 31;
const OP_TAN: i32 = 32;
const OP_ASIN: i32 = 33;
const OP_ACOS: i32 = 34;
const OP_ATAN: i32 = 35;
const OP_SINH: i32 = 36;
const OP_COSH: i32 = 37;
const OP_TANH: i32 = 38;
const OP_ATAN2: i32 = 39;
const OP_HYPOT: i32 = 40;

const OP_LN: i32 = 45;
const OP_LOG10: i32 = 46;
const OP_LOG2: i32 = 47;
const OP_EXP: i32 = 48;

const OP_MIN: i32 = 50;
const OP_MAX: i32 = 51;
const OP_CLAMP: i32 = 52;
const OP_IF: i32 = 53;

const OP_LT: i32 = 60;
const OP_GT: i32 = 61;
const OP_LE: i32 = 62;
const OP_GE: i32 = 63;
const OP_EQ: i32 = 64;

#[inline]
fn eval_program(program: &[f64], x: f64, y: f64) -> f64 {
    let mut stack = [0.0f64; 96];
    let mut sp = 0usize;
    let mut pc = 0usize;

    macro_rules! push {
        ($v:expr) => {{
            if sp >= stack.len() {
                return f64::NAN;
            }
            stack[sp] = $v;
            sp += 1;
        }};
    }

    macro_rules! pop {
        () => {{
            if sp == 0 {
                return f64::NAN;
            }
            sp -= 1;
            stack[sp]
        }};
    }

    while pc < program.len() {
        let op = program[pc] as i32;
        pc += 1;
        match op {
            OP_END => break,
            OP_PUSH => {
                if pc >= program.len() {
                    return f64::NAN;
                }
                push!(program[pc]);
                pc += 1;
            }
            OP_X => push!(x),
            OP_Y => push!(y),

            OP_ADD => {
                let b = pop!();
                let a = pop!();
                push!(a + b);
            }
            OP_SUB => {
                let b = pop!();
                let a = pop!();
                push!(a - b);
            }
            OP_MUL => {
                let b = pop!();
                let a = pop!();
                push!(a * b);
            }
            OP_DIV => {
                let b = pop!();
                let a = pop!();
                push!(a / b);
            }
            OP_POW => {
                let b = pop!();
                let a = pop!();
                push!(a.powf(b));
            }
            OP_MOD => {
                let b = pop!();
                let a = pop!();
                push!(a % b);
            }

            OP_NEG => {
                let a = pop!();
                push!(-a);
            }
            OP_ABS => {
                let a = pop!();
                push!(a.abs());
            }
            OP_SIGN => {
                let a = pop!();
                push!(a.signum());
            }
            OP_FLOOR => {
                let a = pop!();
                push!(a.floor());
            }
            OP_CEIL => {
                let a = pop!();
                push!(a.ceil());
            }
            OP_ROUND => {
                let a = pop!();
                push!(a.round());
            }
            OP_SQRT => {
                let a = pop!();
                push!(a.sqrt());
            }
            OP_CBRT => {
                let a = pop!();
                push!(a.cbrt());
            }

            OP_SIN => {
                let a = pop!();
                push!(a.sin());
            }
            OP_COS => {
                let a = pop!();
                push!(a.cos());
            }
            OP_TAN => {
                let a = pop!();
                push!(a.tan());
            }
            OP_ASIN => {
                let a = pop!();
                push!(a.asin());
            }
            OP_ACOS => {
                let a = pop!();
                push!(a.acos());
            }
            OP_ATAN => {
                let a = pop!();
                push!(a.atan());
            }
            OP_SINH => {
                let a = pop!();
                push!(a.sinh());
            }
            OP_COSH => {
                let a = pop!();
                push!(a.cosh());
            }
            OP_TANH => {
                let a = pop!();
                push!(a.tanh());
            }
            OP_ATAN2 => {
                let xv = pop!();
                let yv = pop!();
                push!(yv.atan2(xv));
            }
            OP_HYPOT => {
                let b = pop!();
                let a = pop!();
                push!(a.hypot(b));
            }

            OP_LN => {
                let a = pop!();
                push!(a.ln());
            }
            OP_LOG10 => {
                let a = pop!();
                push!(a.log10());
            }
            OP_LOG2 => {
                let a = pop!();
                push!(a.log2());
            }
            OP_EXP => {
                let a = pop!();
                push!(a.exp());
            }

            OP_MIN => {
                let b = pop!();
                let a = pop!();
                push!(a.min(b));
            }
            OP_MAX => {
                let b = pop!();
                let a = pop!();
                push!(a.max(b));
            }
            OP_CLAMP => {
                let hi = pop!();
                let lo = pop!();
                let v = pop!();
                push!(v.max(lo).min(hi));
            }
            OP_IF => {
                let otherwise = pop!();
                let then = pop!();
                let condition = pop!();
                push!(if condition != 0.0 { then } else { otherwise });
            }

            OP_LT => {
                let b = pop!();
                let a = pop!();
                push!(if a < b { 1.0 } else { 0.0 });
            }
            OP_GT => {
                let b = pop!();
                let a = pop!();
                push!(if a > b { 1.0 } else { 0.0 });
            }
            OP_LE => {
                let b = pop!();
                let a = pop!();
                push!(if a <= b { 1.0 } else { 0.0 });
            }
            OP_GE => {
                let b = pop!();
                let a = pop!();
                push!(if a >= b { 1.0 } else { 0.0 });
            }
            OP_EQ => {
                let b = pop!();
                let a = pop!();
                push!(if a == b { 1.0 } else { 0.0 });
            }
            _ => return f64::NAN,
        }
    }

    if sp == 1 {
        stack[0]
    } else {
        f64::NAN
    }
}

#[no_mangle]
pub extern "C" fn x_alloc(count: usize) -> *mut f64 {
    if count == 0 {
        return std::ptr::null_mut();
    }
    let Ok(layout) = Layout::array::<f64>(count) else {
        return std::ptr::null_mut();
    };
    unsafe { alloc(layout) as *mut f64 }
}

#[no_mangle]
pub extern "C" fn x_free(ptr: *mut f64, count: usize) {
    if ptr.is_null() || count == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<f64>(count) {
        unsafe { dealloc(ptr as *mut u8, layout) };
    }
}

/// 批量计算：xs/ys/out 都是 count 个 f64。
#[no_mangle]
pub extern "C" fn x_eval_many(
    program_ptr: *const f64,
    program_len: usize,
    xs_ptr: *const f64,
    ys_ptr: *const f64,
    count: usize,
    out_ptr: *mut f64,
) -> usize {
    if program_ptr.is_null() || xs_ptr.is_null() || out_ptr.is_null() || count == 0 {
        return 0;
    }
    let program = unsafe { slice::from_raw_parts(program_ptr, program_len) };
    let xs = unsafe { slice::from_raw_parts(xs_ptr, count) };
    let ys = if ys_ptr.is_null() {
        None
    } else {
        Some(unsafe { slice::from_raw_parts(ys_ptr, count) })
    };
    let out = unsafe { slice::from_raw_parts_mut(out_ptr, count) };

    for index in 0..count {
        let y = ys.map(|values| values[index]).unwrap_or(0.0);
        out[index] = eval_program(program, xs[index], y);
    }
    count
}

#[no_mangle]
pub extern "C" fn x_eval_one(
    program_ptr: *const f64,
    program_len: usize,
    x: f64,
    y: f64,
) -> f64 {
    if program_ptr.is_null() {
        return f64::NAN;
    }
    let program = unsafe { slice::from_raw_parts(program_ptr, program_len) };
    eval_program(program, x, y)
}
