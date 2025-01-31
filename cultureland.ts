﻿import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
import qs from "querystring";
import { CookieJar } from "tough-cookie";
import mTransKey from "./transkey.js";

class Cultureland {
    public jar: CookieJar;
    public client: AxiosInstance;
    public constructor() {
        this.jar = new CookieJar();
        this.client = axios.create({
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G998N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36",
                "Connection": "keep-alive"
            },
            httpAgent: new HttpCookieAgent({ cookies: { jar: this.jar } }),
            httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.jar } })
        });
    };

    public async checkPin(pin: string) {
        if (!await this.isLogin()) throw new Error("ERR_LOGIN_REQUIRED");
        const pinFormatResult = Cultureland.checkPinFormat(pin);
        if (!pinFormatResult.success) return {
            success: false,
            message: pinFormatResult.message
        };

        const transKey = new mTransKey();
        await transKey.getServletData(this.jar);
        await transKey.getKeyData(this.jar);

        const keypad = await transKey.createKeypad(this.jar, "number", "input-14", "culturelandInput", "tel");
        const skipData = await keypad.getSkipData();
        const encryptedPin = keypad.encryptPassword(pin[3], skipData);

        /*
        const voucherData = await this.client.post("https://m.cultureland.co.kr/vchr/getVoucherCheckMobileUsed.json", qs.stringify({
            "culturelandNo": pinFormatResult.pinParts[0] + pinFormatResult.pinParts[1] + pinFormatResult.pinParts[2],
            "culturelandInput": pinFormatResult.pinParts[0],
            "culturelandInput": pinFormatResult.pinParts[1],
            "culturelandInput": pinFormatResult.pinParts[2],
            "culturelandInput": "*".repeat(pinFormatResult.pinParts[3].length),
            "seedKey": transKey.crypto.encSessionKey,
            "initTime": transKey.initTime,
            "keyIndex_input-14": keypad.keyIndex,
            "keyboardType_input-14": keypad.keyboardType + "Mobile",
            "fieldType_input-14": keypad.fieldType,
            "transkeyUuid": transKey.crypto.transkeyUuid,
            "transkey_input-14": encryptedPin,
            "transkey_HM_input-14": transKey.crypto.hmacDigest(encryptedPin)
        })).then(res => res.data);
        console.log(voucherData);
        return {
            success: true,
            data: voucherData
        };
        */
    };

    public async getBalance(): Promise<{
        success: true,
        data: {
            memberKind: string,
            resultCode: 0,
            resultMessage: "성공",
            blnWaitCash: 0,
            walletPinYN: boolean,
            myCash: number,
            blnAmt: number,
            bnkAmt: number,
            limitCash: number
            remainCash: number,
            safeDelYn: boolean,
            walletYN: boolean,
            casChargeYN: boolean,
        }
    } | {
        success: false,
        message: string
    }> {
        try {
            if (!await this.isLogin()) throw new Error("ERR_LOGIN_REQUIRED");

            const balance = await this.client.post("https://m.cultureland.co.kr/tgl/getBalance.json").then(res => res.data);

            if (balance.resultMessage !== "성공") throw new Error("ERR_BALANCE_FAILED");

            for (const key in balance) {
                if (!isNaN(balance[key])) balance[key] = Number(balance[key]);
                if (balance[key] === "Y" || balance[key] === "N") balance[key] = balance[key] === "Y";
            };

            return {
                success: true,
                data: balance
            };
        } catch (e) {
            return {
                success: false,
                message: (e as Error).message
            };
        };
    };

    public async charge(_pin: string | string[], checkPin = true) {
        try {
            if (!await this.isLogin()) throw new Error("ERR_LOGIN_REQUIRED");

            if (checkPin) {
                // const voucherData = await this.checkPin(pin);
                // console.log(voucherData);

                // TODO: validate voucher codes
            };

            const pin = Cultureland.checkPinFormat(typeof _pin === "string" ? _pin : _pin.join?.(""));
            if (!pin.success) return {
                success: false,
                message: pin.message
            };

            await this.client.get(pin.pinParts[3].length === 4 ? "https://m.cultureland.co.kr/csh/cshGiftCard.do" : "https://m.cultureland.co.kr/csh/cshGiftCardOnline.do");

            const transKey = new mTransKey();
            await transKey.getServletData(this.jar);
            await transKey.getKeyData(this.jar);

            const keypad = await transKey.createKeypad(this.jar, "number", "txtScr14", "scr14", "password");
            const skipData = await keypad.getSkipData();
            const encryptedPin = keypad.encryptPassword(pin.pinParts[3], skipData);

            const requestBody = qs.stringify({
                versionCode: "",
                scr11: pin.pinParts[0],
                scr12: pin.pinParts[1],
                scr13: pin.pinParts[2],
                scr14: "*".repeat(pin.pinParts[3].length),
                seedKey: transKey.crypto.encSessionKey,
                initTime: transKey.initTime,
                keyIndex_txtScr14: keypad.keyIndex,
                keyboardType_txtScr14: "numberMobile",
                fieldType_txtScr14: "password",
                transkeyUuid: transKey.crypto.transkeyUuid,
                transkey_txtScr14: encryptedPin,
                transkey_HM_txtScr14: transKey.crypto.hmacDigest(encryptedPin)
            });
            const chargeRequest = await this.client.post(pin.pinParts[3].length === 4 ? "https://m.cultureland.co.kr/csh/cshGiftCardProcess.do" : "https://m.cultureland.co.kr/csh/cshGiftCardOnlineProcess.do", requestBody, {
                maxRedirects: 0,
                validateStatus: status => status === 302
            }).catch(() => { throw new Error("ERR_CHARGE_FAILED") });
            const chargeResult = await this.client.get("https://m.cultureland.co.kr/" + chargeRequest.headers["location"]).then(res => res.data);
            const chargeData = chargeResult.split("<tbody>")[1].split("<td>");
            const message = chargeData[3].split("</td>")[0].replace(/<\/?[\d\w\s='#]+>/g, "");
            const amount = Number(chargeData[4].split("</td>")[0].replace(/\D/g, ""));
            const chargeData2 = chargeResult.split('class="result">')[1].split("</div>")[0];
            const [normalAmount, walletAmount] = chargeData2.split("dlWalletChargeAmt").map((x: string) => Number(x.replace(/\D/g, "")));
            return {
                success: true,
                message,
                amount: Math.min(Math.max(normalAmount, walletAmount), amount)
            };
        } catch (e) {
            return {
                success: false,
                message: (e as Error).message
            };
        };
    };

    /*
    public async gift(amount, quantity, phone) {
        if (!await this.isLogin()) throw new Error("ERR_LOGIN_REQUIRED");

        await this.client.get("https://m.cultureland.co.kr/gft/gftPhoneApp.do");

        await this.client.post("https://m.cultureland.co.kr/gft/gftPhoneCashProc.do", qs.stringify({
            revEmail: "",
            sendType: "S",
            userKey: user_key,
            limitGiftBank: "N",
            giftCategory: "M",
            amount,
            quantity,
            revPhone: phone,
            sendTitl: "",
            paymentType: "cash"
        }), {
            validateStatus: status => status === 302
        }).catch(() => { throw new Error("ERR_GIFT_FAILED"); });

        const giftResult = await this.client.get("https://m.cultureland.co.kr/gft/gftPhoneCfrm.do").then(res => res.data);

        if (giftResult.includes('<p>선물(구매)하신 <strong class="point">모바일문화상품권</strong>을<br /><strong class="point">요청하신 정보로 전송</strong>하였습니다.</p>')) {
            const giftData = giftResult.split("- 상품권 바로 충전 : https://m.cultureland.co.kr/csh/dc.do?code=")[1].split("&lt;br&gt;");

            return {
                success: true,
                message: "선물(구매)하신 모바일문화상품권을 요청하신 정보로 전송하였습니다",
                code: giftData[0],
                pin: giftData[8].replace("- 바코드번호 : ", "")
            };
        }

        throw new Error("ERR_GIFT_FAILED");
    };
    */

    public async isLogin() {
        const isLogin = await this.client.post("https://m.cultureland.co.kr/mmb/isLogin.json").then(res => res.data === "true").catch(() => false);
        return isLogin;
    };

    public async getUserInfo() {
        if (!(await this.isLogin())) throw new Error("ERR_LOGIN_REQUIRED");

        const userInfo = await this.client.post("https://m.cultureland.co.kr/tgl/flagSecCash.json").then(res => res.data);

        if (userInfo.resultMessage !== "성공") throw new Error("ERR_USERINFO_FAILED");

        delete userInfo.user_id;
        delete userInfo.user_key;
        userInfo.CashPwd = userInfo.CashPwd !== "0";
        userInfo.Del_Yn = userInfo.Del_Yn === "Y";
        userInfo.idx = Number(userInfo.idx);
        userInfo.SafeLevel = Number(userInfo.SafeLevel);
        userInfo.userKey = Number(userInfo.userKey);

        return userInfo;
    };

    public async login(id: string, password: string) {
        try {
            this.jar.setCookieSync("KeepLoginConfig=sd_" + crypto.randomBytes(4).toString("hex"), "https://m.cultureland.co.kr");
            const transKey = new mTransKey();
            await transKey.getServletData(this.jar);
            await transKey.getKeyData(this.jar);

            const keypad = await transKey.createKeypad(this.jar, "qwerty", "passwd", "passwd", "password");
            const skipData = await keypad.getSkipData();
            const encryptedPassword = keypad.encryptPassword(password, skipData);
            const requestBody = qs.stringify({
                agentUrl: "",
                returnUrl: "",
                keepLoginInfo: "",
                phoneForiOS: "",
                hidWebType: "other",
                bioCheckResult: "",
                browserId: "", // /assets/js/egovframework/com/cland/was/mmb/loginMain.js?version=1.0 LINE 19
                userId: id,
                passwd: "*".repeat(password.length),
                keepLogin: "Y",
                seedKey: transKey.crypto.encSessionKey,
                initTime: transKey.initTime,
                keyIndex_passwd: keypad.keyIndex,
                keyboardType_passwd: keypad.keyboardType + "Mobile",
                fieldType_passwd: keypad.fieldType,
                transkeyUuid: transKey.crypto.transkeyUuid,
                transkey_passwd: encryptedPassword,
                transkey_HM_passwd: transKey.crypto.hmacDigest(encryptedPassword)
            });
            const loginRequest = await this.client.post("https://m.cultureland.co.kr/mmb/loginProcess.do", requestBody, {
                headers: {
                    "Referer": "https://m.cultureland.co.kr/mmb/loginMain.do"
                },
                maxRedirects: 0,
                validateStatus: status => status === 302
            }).catch(() => { throw new Error("ERR_LOGIN_FAILED"); });
            if (loginRequest.headers["location"] === "https://m.cultureland.co.kr/cmp/authConfirm.do") throw new Error("ERR_LOGIN_RESTRICTED");
            return {
                success: true,
                message: "Login success."
            };
        } catch (e) {
            return {
                success: false,
                message: (e as Error).message
            }
        };
    };

    public static checkPinFormat(pin: string): { success: true, message: string, pinParts: [string, string, string, string] } | { success: false, message: string } {
        if (typeof pin !== "string" || !pin) return {
            success: false,
            message: "ERR_INVALID_PIN_TYPE"
        };
        pin = pin.replace(/\D/g, "");
        let pinParts: string[] = [];
        if (pin.length === 16 || pin.length === 18) pinParts = [pin.substring(0, 4), pin.substring(4, 8), pin.substring(8, 12), pin.substring(12)];
        else return {
            success: false,
            message: "ERR_INVALID_PIN_DELIMITER"
        };
        pinParts = pinParts.filter(Boolean).map(p => String(p).trim());

        if (pinParts.some(Number.isNaN)) return {
            success: false,
            message: "ERR_INVALID_TYPEOF_PIN_PART"
        };

        if (
            pinParts.length !== 4 ||
            pinParts[0].length !== 4 ||
            pinParts[1].length !== 4 ||
            pinParts[2].length !== 4 ||
            ![4, 6].includes(pinParts[3].length)
        ) return {
            success: false,
            message: "ERR_INVALID_PIN_LENGTH 1"
        };

        if (pinParts[0].startsWith("41")) {
            if (pinParts[3].length !== 4) return {
                success: false,
                message: "ERR_INVALID_PIN_LENGTH 2"
            };
        } else if (!["20", "21", "22", "23", "24", "25", "30", "31", "32", "33", "34", "35", "40", "42", "43", "44", "45", "51", "52", "53", "54", "55"].includes(pinParts[0].substring(0, 2))) return {
            success: false,
            message: "ERR_INVALID_PIN_PREFIX 1"
        };

        if (pinParts[0].startsWith("41") && !(pinParts[0].startsWith("416") || pinParts[0].startsWith("418"))) return {
            success: false,
            message: "ERR_INVALID_PIN_PREFIX 2"
        };

        return {
            success: true,
            message: "Valid pin format.",
            pinParts: pinParts as [string, string, string, string]
        };
    };
}

export default Cultureland;